const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs").promises;
const pdfParse = require("pdf-parse");
const mammoth = require("mammoth"); // For DOCX file processing
const { OllamaEmbeddings } = require("@langchain/community/embeddings/ollama");
const { MemoryVectorStore } = require("langchain/vectorstores/memory");
const { RecursiveCharacterTextSplitter } = require("langchain/text_splitter");
const { Ollama } = require("@langchain/community/llms/ollama");
const cors = require("cors");

const app = express();
const PORT = 5000;

app.use(cors({ origin: "http://localhost:3000" }));
app.use(express.json());

const uploadDir = path.join(__dirname, "uploads");
fs.mkdir(uploadDir, { recursive: true }).catch(console.error);

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024 }, // 20MB limit
}).array("file", 5);

const vectorStores = {};
const embeddings = new OllamaEmbeddings({ model: "nomic-embed-text" });
const llm = new Ollama({ model: "llama3" });
async function extractTextFromDocx(buffer) {
    try {
        const result = await mammoth.extractRawText({ buffer });
        return result.value || "";
    } catch (error) {
        console.error("Error extracting text from DOCX:", error);
        return "";
    }
}
async function extractTextFromTxt(buffer) {
    try {
        return buffer.toString("utf-8");
    } catch (error) {
        console.error("Error extracting text from TXT:", error);
        return "";
    }
}

app.post("/upload", upload, async (req, res) => {
    try 
    {
        if (!req.files || req.files.length === 0) 
        {
            return res.status(400).json({ error: "No files uploaded!" });
        }

        if (Object.keys(vectorStores).length + req.files.length > 5) 
        {
            return res.status(400).json({ error: "File upload limit exceeded! You can upload up to 5 files." });
        }

        res.status(202).json({ message: "Files received. Processing in the background." });

        const splitter = new RecursiveCharacterTextSplitter({ chunkSize: 1000, chunkOverlap: 200 });

        await Promise.allSettled(req.files.map(async (file) => {
            try {
                let extractedText = "";

                const ext = path.extname(file.originalname).toLowerCase();
                if (ext === ".pdf") {
                    const pdfData = await pdfParse(file.buffer);
                    extractedText = pdfData.text;
                } else if (ext === ".docx") {
                    extractedText = await extractTextFromDocx(file.buffer);
                } else if (ext === ".txt") {
                    extractedText = await extractTextFromTxt(file.buffer);
                } else {
                    console.error(`Unsupported file type: ${file.originalname}`);
                    return;
                }

                if (!extractedText.trim()) {
                    console.error(`No text extracted from ${file.originalname}`);
                    return;
                }
                const docs = await splitter.createDocuments([extractedText]);
                const vectorStore = await MemoryVectorStore.fromDocuments(docs, embeddings);
                vectorStores[file.originalname] = vectorStore;

                console.log(`Successfully processed: ${file.originalname}`);
            } catch (fileError) {
                console.error(`Error processing ${file.originalname}:`, fileError);
            }
        }));
    } catch (error) {
        console.error("File upload error:", error);
        res.status(500).json({ error: "File uploading has failed. Please try again." });
    }
});

app.post("/ask", async (req, res) => {
    try {
        const { question, filename } = req.body;
        if (!question) return res.status(400).json({ error: "Please provide a question." });

        let context = "";

    
        if (filename && vectorStores[filename]) {
            const results = await vectorStores[filename].similaritySearch(question, 3);
            context = results.length ? results.map(r => r.pageContent).join("\n\n").slice(0, 1200) : "";
        }

        let prompt = "";

        if (context) {
            prompt = `Context:\n${context}\n\nQuestion: ${question}\n\nAnswer concisely based on the given context. If the context is not helpful, answer using your general knowledge.`;
        } else {
            prompt = `Answer using your general knowledge:\n\nQuestion: ${question}`;
        }

        
        const lowerQuestion = question.toLowerCase();
        if (lowerQuestion.includes("give") && lowerQuestion.includes("questions")) {
            prompt = `Generate 5 important questions based on this document:\n\n${context || "No document provided. Use general knowledge."}`;
        } else if (lowerQuestion.includes("important points")) {
            prompt = `Extract the most important points from this document:\n\n${context || "No document provided. Use general knowledge."}`;
        } else if (lowerQuestion.includes("summarize")) {
            prompt = `Summarize this document in a concise way:\n\n${context || "No document provided. Use general knowledge."}`;
        }

        const response = await Promise.race([
            llm.call(prompt),
            new Promise((_, reject) => setTimeout(() => reject(new Error("Response timed out")), 300000)) // 5 min timeout
        ]);

        res.status(200).json({ answer: response.trim() || "I don't know." });
    } catch (error) {
        console.error("Error fetching answer:", error);
        const errorMessage = error.message === "Response timed out" ? "Response timed out. Please try again." : "Failed to process the question.";
        res.status(500).json({ error: errorMessage });
    }
});

app.delete("/delete", async (req, res) => {
    try {
        const { filename } = req.body;
        if (!filename) return res.status(400).json({ error: "Please provide a filename." });
        if (!vectorStores[filename]) return res.status(404).json({ error: "File not found in memory." });

        delete vectorStores[filename];
        res.status(200).json({ message: `${filename} has been deleted.` });
    } catch (error) {
        res.status(500).json({ error: "Failed to delete file." });
    }
});
app.get("/debug", (req, res) => {
    res.json({ stored_files: Object.keys(vectorStores) });
});

app.listen(PORT, "127.0.0.1", () => {
    console.log(`Server running on http://127.0.0.1:${PORT}`);
});
