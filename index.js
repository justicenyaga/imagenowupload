// Required modules
const express = require("express");
const axios = require("axios");
const morgan = require("morgan");
const FormData = require("form-data");
const fs = require("fs");
const path = require("path");
const bodyParser = require("body-parser");
const crypto = require("crypto");

const app = express();

// Middleware to parse JSON
app.use(morgan("tiny"));
app.use(express.json());
app.use(bodyParser.json());

// In-memory storage for request bodies
const storage = {};

// generate random id
const generateId = () => crypto.randomUUID();

// Helper function to download a file
const downloadFile = async (fileUrl, destPath) => {
  const writer = fs.createWriteStream(destPath);
  const response = await axios({
    url: fileUrl,
    method: "GET",
    responseType: "stream",
  });
  response.data.pipe(writer);
  return new Promise((resolve, reject) => {
    writer.on("finish", resolve);
    writer.on("error", reject);
  });
};

app.get("/", (req, res) => {
  res.send("Hello world");
});

// Endpoint to handle file upload
app.post("/upload-file", async (req, res) => {
  const {
    fileUrl, // File URL to be fetched
    documentType,
    refId,
    entityId,
    entityName,
    lobId,
    documentName,
    contextId,
    BMPReff,
  } = req.body;

  const {
    authorization,
    "subscription-key": subscriptionKey,
    "target-url": headerHargetUrl,
  } = req.headers;

  const targetUrl =
    headerHargetUrl || "https://brtgw.britam.com/image_now/uat/api/v1/upload/";

  if (
    !fileUrl ||
    !documentType ||
    !refId ||
    !entityId ||
    !entityName ||
    !lobId ||
    // !documentName ||
    !contextId ||
    !BMPReff
  ) {
    return res.status(400).json({ error: "All fields are required" });
  }

  if (!authorization || !subscriptionKey) {
    return res.status(400).json({
      error: "Authorization and Subscription Key headers are required",
    });
  }

  const tempFilePath = path.join(__dirname, "temp_file");

  const fileName = path.basename(fileUrl);

  try {
    // Step 1: Download the file
    await downloadFile(fileUrl, tempFilePath);

    // Step 2: Prepare the multipart form data
    const formData = new FormData();
    formData.append("documentType", documentType);
    formData.append("refId", refId);
    formData.append("entityId", entityId);
    formData.append("entityName", entityName);
    formData.append("lobId", lobId);
    formData.append("documentName", fileName);
    formData.append("contextId", contextId);
    formData.append("BMPReff", BMPReff);
    formData.append("file", fs.createReadStream(tempFilePath));

    // Step 3: Make the API request
    const response = await axios.post(targetUrl, formData, {
      headers: {
        // ...formData.getHeaders(),
        "Content-Type": "multipart/form-data",
        Authorization: authorization,
        "Ocp-Apim-Subscription-Key": subscriptionKey,
      },
    });

    // Step 4: Return the API response
    res.json({ message: "File uploaded successfully", data: response.data });

    // Step 5: Delete the temporary file after successful upload
    fs.unlinkSync(tempFilePath);
  } catch (error) {
    console.error("Error uploading file:", error);

    let errorMessage = {};

    if (error.response) {
      // Axios response contains the status code and the response body
      errorMessage = {
        status: error.response.status,
        data: error.response.data,
      };
    } else {
      // For other types of errors, such as network errors or timeouts
      errorMessage = { message: error.message };
    }

    res
      .status(500)
      .json({ error: "Failed to upload file", details: errorMessage });
  } finally {
    // Cleanup: Ensure the file is removed in case of failure
    if (fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
    }
  }
});

// API to store the request body and return an ID
app.post("/store", (req, res) => {
  const id = generateId();
  storage[id] = req.body; // Store the body using the ID
  res.json({ message: "Body stored successfully!", id });
});

// API to retrieve stored body by ID
app.get("/retrieve/:id", (req, res) => {
  const id = req.params.id;
  const content = storage[id];

  if (content) {
    res.json({ id, data: content });
  } else {
    res.status(404).json({ message: "Content not found for the given ID." });
  }
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
