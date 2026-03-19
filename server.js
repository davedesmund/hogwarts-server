const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

app.post('/animate', async (req, res) => {
    try {
        const { image } = req.body;
        const API_KEY = process.env.SEGMIND_API_KEY;

        if (!API_KEY) return res.status(500).json({ error: "Ministry API Key missing." });
        if (!image) return res.status(400).json({ error: "No portrait provided." });

        console.log("Casting spell: Dispatching to Segmind...");

        const response = await fetch("https://api.segmind.com/v1/live-portrait", {
            method: 'POST',
            headers: { 
                'x-api-key': API_KEY, 
                'Content-Type': 'application/json' 
            },
            body: JSON.stringify({
                input_image: image,
                // If Segmind removed this public video, it might be causing the error. 
                driving_video: "https://segmind-sd-models.s3.amazonaws.com/liveportrait/driving_video.mp4",
                stitch: true,
                live_portrait_multiplier: 1.0,
                base64: false
            })
        });

        const data = await response.json();
        
        // ✨ NEW: Print the exact response from Segmind so we can read it
        console.log("Raw Segmind Data:", JSON.stringify(data).substring(0, 300));

        if (!response.ok || (!data.video_url && !data.job_id)) {
             throw new Error(data.message || "Segmind returned an invalid response.");
        }

        res.json({
            videoUrl: data.video_url || null,
            job_id: data.job_id || null
        });

    } catch (err) {
        console.error("Spell Failure:", err.message);
        res.status(500).json({ error: err.message });
    }
});

app.get('/status/:jobId', async (req, res) => {
    try {
        const { jobId } = req.params;
        const API_KEY = process.env.SEGMIND_API_KEY;

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