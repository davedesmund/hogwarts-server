const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

app.get('/status/wakeup', (req, res) => res.send("Awake"));

app.post('/animate', async (req, res) => {
    try {
        const { image } = req.body;
        const API_KEY = process.env.SEGMIND_API_KEY?.trim(); 

        if (!API_KEY) return res.status(500).json({ error: "Ministry API Key missing." });
        if (!image) return res.status(400).json({ error: "No portrait provided." });

        console.log("1. Uploading portrait to Segmind Vault...");
        
        const uploadRes = await fetch("https://workflows-api.segmind.com/upload-asset", {
            method: 'POST',
            headers: { 
                'x-api-key': API_KEY, 
                'Content-Type': 'application/json' 
            },
            body: JSON.stringify({ data_urls: [image] })
        });

        let uploadData;
        try {
            uploadData = await uploadRes.json();
        } catch(e) {
            uploadData = { parse_error: "Vault returned non-JSON data." };
        }
        
        // ✨ THE INTERROGATION: Print exactly what the Vault says
        console.log("Vault Raw Response:", JSON.stringify(uploadData));

        const portraitUrl = uploadData?.file_urls?.[0];
        
        // Define our payload variables
        let finalImagePayload = "";
        let isBase64 = false;

        if (portraitUrl) {
            console.log(`Vault Success! Safe URL generated: ${portraitUrl}`);
            finalImagePayload = portraitUrl;
            isBase64 = false;
        } else {
            // ✨ THE BATTERING RAM: If Vault fails, fallback to direct Base64 injection
            console.log("Vault refused. Falling back to direct Base64 injection...");
            finalImagePayload = image.replace(/^data:image\/\w+;base64,/, "");
            isBase64 = true;
        }

        console.log("2. Dispatching to Live Portrait AI...");

        const controller = new AbortController();
        const timeoutId = setTimeout(() => { controller.abort(); }, 180000); // 3-minute fuse

        try {
            const response = await fetch("https://api.segmind.com/v1/live-portrait", {
                method: 'POST',
                headers: { 
                    'x-api-key': API_KEY, 
                    'Content-Type': 'application/json' 
                },
                body: JSON.stringify({
                    input_image: finalImagePayload, 
                    driving_video: "https://segmind-sd-models.s3.amazonaws.com/liveportrait/driving_video.mp4",
                    stitch: true,
                    live_portrait_multiplier: 1.0,
                    base64: isBase64 
                }),
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);

            const data = await response.json();
            console.log("Segmind AI Response:", JSON.stringify(data).substring(0, 300));

            if (!response.ok || (!data.video_url && !data.job_id)) {
                 throw new Error(data.error || data.message || "Segmind rejected the image.");
            }

            res.json({
                videoUrl: data.video_url || null,
                job_id: data.job_id || null
            });

        } catch (fetchError) {
            clearTimeout(timeoutId);
            if (fetchError.name === 'AbortError') {
                throw new Error("Segmind took too long and timed out (180s).");
            }
            throw fetchError;
        }

    } catch (err) {
        console.error("Spell Failure:", err.message);
        res.status(500).json({ error: err.message });
    }
});

// Status Polling Route
app.get('/status/:jobId', async (req, res) => {
    try {
        const { jobId } = req.params;
        const API_KEY = process.env.SEGMIND_API_KEY?.trim();

        const statusRes = await fetch(`https://api.segmind.com/v1/list-jobs/${jobId}`, {
            headers: { 'x-api-key': API_KEY }
        });
        const data = await statusRes.json();

        res.json({
            status: data.status, 
            videoUrl: data.data?.video_url || data.data?.image_url || null
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`The Daily Prophet Server is live on port ${PORT}`);
});