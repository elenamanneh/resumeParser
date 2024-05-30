document.getElementById('fileInput').addEventListener('change', (event) => {
    const fileInput = event.target;
    const fileNameDisplay = document.getElementById('fileNameDisplay');
    const file = fileInput.files[0];
    if (file) {
        fileNameDisplay.innerHTML = `<p>Selected File: ${file.name}</p>`;
    } else {
        fileNameDisplay.innerHTML = '';
    }
});

document.getElementById('folderInputButton').addEventListener('click', async () => {
    const directoryHandle = await window.showDirectoryPicker();
    selectedFiles = [];
    for await (const entry of directoryHandle.values()) {
        if (entry.kind === 'file' && (entry.name.endsWith('.pdf') || entry.name.endsWith('.docx'))) {
            selectedFiles.push(entry);
        }
    }
    const fileNameDisplay = document.getElementById('fileNameDisplay');
    fileNameDisplay.innerHTML = `<p>Selected Folder: ${directoryHandle.name} (${selectedFiles.length} files)</p>`;
});

document.getElementById('parseButton').addEventListener('click', () => {
    const fileInput = document.getElementById('fileInput');
    const file = fileInput.files[0];
    const keywords = document.getElementById('keywordsInput').value.split(',').map(k => k.trim().toLowerCase());
    const resultsDiv = document.getElementById('results');

    if (!file && !selectedFiles) {
        alert('Please upload a zip file or select a folder containing resumes.');
        return;
    }

    if (!keywords.length || keywords[0] === '') {
        alert('Please enter at least one keyword.');
        return;
    }

    resultsDiv.innerHTML = '';

    const matchedFiles = {};
    const matchedAllKeywords = [];
    const fileKeywordMatches = {};

    if (file) {
        const reader = new FileReader();
        reader.onload = async () => {
            try {
                const zip = await JSZip.loadAsync(reader.result);
                const files = Object.keys(zip.files).filter(filename => filename.endsWith('.pdf') || filename.endsWith('.docx'));

                for (const filename of files) {
                    try {
                        const fileData = await zip.files[filename].async('arraybuffer');
                        if (filename.endsWith('.pdf')) {
                            extractTextFromPDF(new Uint8Array(fileData), text => {
                                processText(filename, text, keywords, matchedFiles, matchedAllKeywords, fileKeywordMatches);
                            });
                        } else if (filename.endsWith('.docx')) {
                            extractTextFromDocx(fileData, text => {
                                processText(filename, text, keywords, matchedFiles, matchedAllKeywords, fileKeywordMatches);
                            });
                        }
                    } catch (fileError) {
                        console.error(`Error processing file ${filename}:`, fileError);
                    }
                }

                setTimeout(() => displayResults(resultsDiv, matchedFiles, matchedAllKeywords, fileKeywordMatches, keywords.length), 1000);
            } catch (zipError) {
                console.error("Error reading zip file:", zipError);
                alert("Error reading zip file. Please ensure it's a valid zip file.");
            }
        };

        reader.readAsArrayBuffer(file);
    }

    if (selectedFiles) {
        (async () => {
            for (const fileHandle of selectedFiles) {
                try {
                    const file = await fileHandle.getFile();
                    const arrayBuffer = await file.arrayBuffer();
                    if (file.name.endsWith('.pdf')) {
                        extractTextFromPDF(new Uint8Array(arrayBuffer), text => {
                            processText(file.name, text, keywords, matchedFiles, matchedAllKeywords, fileKeywordMatches);
                        });
                    } else if (file.name.endsWith('.docx')) {
                        extractTextFromDocx(arrayBuffer, text => {
                            processText(file.name, text, keywords, matchedFiles, matchedAllKeywords, fileKeywordMatches);
                        });
                    }
                } catch (fileError) {
                    console.error(`Error processing file ${file.name}:`, fileError);
                }
            }

            setTimeout(() => displayResults(resultsDiv, matchedFiles, matchedAllKeywords, fileKeywordMatches, keywords.length), 1000);
        })();
    }
});

let selectedFiles = null;

function extractTextFromDocx(arrayBuffer, callback) {
    mammoth.extractRawText({ arrayBuffer: arrayBuffer })
        .then(result => {
            callback(result.value); // The raw text
        })
        .catch(err => {
            console.error("Error extracting DOCX file:", err);
        });
}

function extractTextFromPDF(arrayBuffer, callback) {
    const pdfjsLib = window['pdfjs-dist/build/pdf'];
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.7.570/pdf.worker.min.js';

    let text = '';
    pdfjsLib.getDocument({ data: arrayBuffer }).promise.then(pdf => {
        const numPages = pdf.numPages;
        let pagePromises = [];

        for (let i = 1; i <= numPages; i++) {
            pagePromises.push(pdf.getPage(i).then(page => {
                return page.getTextContent().then(textContent => {
                    textContent.items.forEach(item => text += item.str + ' ');
                });
            }));
        }

        Promise.all(pagePromises).then(() => {
            callback(text);
        }).catch(err => {
            console.error("Error extracting text from PDF page:", err);
        });
    }).catch(err => {
        console.error("Error extracting PDF file:", err);
    });
}

function processText(filename, text, keywords, matchedFiles, matchedAllKeywords, fileKeywordMatches) {
    const lowerText = text.toLowerCase();
    const results = searchKeywordsInText(lowerText, keywords);
    const totalMatches = Object.values(results).reduce((acc, curr) => acc + curr, 0);

    if (totalMatches > 0) {
        fileKeywordMatches[filename] = totalMatches;
    }

    if (Object.values(results).every(v => v === 1)) {
        matchedAllKeywords.push(filename);
    }

    for (const keyword in results) {
        if (results[keyword] === 1) {
            if (!matchedFiles[keyword]) matchedFiles[keyword] = [];
            matchedFiles[keyword].push(filename);
        }
    }
}

function searchKeywordsInText(text, keywords) {
    const results = {};
    for (const keyword of keywords) {
        results[keyword] = text.includes(keyword) ? 1 : 0;
    }
    return results;
}
function displayResults(resultsDiv, matchedFiles, matchedAllKeywords, fileKeywordMatches, numKeywords) {
    resultsDiv.innerHTML += `<h3>Files containing all keywords:</h3>`;
    let content = '<div class="content">';
    if (matchedAllKeywords.length) {
        matchedAllKeywords.forEach(file => content += `<p>${file}</p>`);
    } else {
        content += '<p>None</p>';
    }
    content += '</div>';
    resultsDiv.innerHTML += content;

    for (const keyword in matchedFiles) {
        resultsDiv.innerHTML += `<h3 class="toggle-header">Files containing '${keyword}'▼</h3>`;
        content = '<div class="toggle-content content">';
        if (matchedFiles[keyword].length) {
            matchedFiles[keyword].forEach(file => content += `<p>${file}</p>`);
        } else {
            content += '<p>None</p>';
        }
        content += '</div>';
        resultsDiv.innerHTML += content;
    }

    resultsDiv.innerHTML += `<h3>File ranking according to matches (${numKeywords} keywords entered):</h3>`;
    content = '<div class = "content">';
    const sortedFiles = Object.entries(fileKeywordMatches).sort((a, b) => b[1] - a[1]);
    sortedFiles.forEach(([file, matches]) => content += `<p>${file}: ${matches} matches</p>`);
    content += '</div>';
    resultsDiv.innerHTML += content;

    addToggleFunctionality();
}

function addToggleFunctionality() {
    document.querySelectorAll('.toggle-header').forEach(header => {
        header.addEventListener('click', () => {
            const content = header.nextElementSibling;
            content.style.display = content.style.display === 'none' ? 'block' : 'none';
        });
    });
}
