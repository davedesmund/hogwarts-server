const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// 1. Wakeup Route
app.get('/status/wakeup', (req, res) => res.send("Awake"));

// 2. THE PULSE CHECK ROUTE (To test Segmind directly)
app.get('/test-segmind', async (req, res) => {
    try {
        const API_KEY = process.env.SEGMIND_API_KEY?.trim();
        if (!API_KEY) return res.send("Error: API Key missing in Render Environment.");

        console.log("Running Pulse Check...");

        const response = await fetch("https://api.segmind.com/v1/live-portrait", {
            method: 'POST',
            headers: { 
                'x-api-key': API_KEY, 
                'Content-Type': 'application/json' 
            },
            body: JSON.stringify({
                // A clean, public portrait from Unsplash
                input_image: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=512&h=512&fit=crop", 
                driving_video: "https://segmind-sd-models.s3.amazonaws.com/liveportrait/driving_video.mp4",
                stitch: true,
                live_portrait_multiplier: 1.0,
                base64: false // This is FALSE here because we are using a real URL for the test
            })
        });

        const data = await response.json();
        res.json({ http_status: response.status, segmind_response: data });

    } catch (err) {
        res.json({ error: err.message });
    }
});

// 3. The Main Magic Route (From the phone)
app.post('/animate', async (req, res) => {
    try {
        const { image } = req.body;
        const API_KEY = process.env.SEGMIND_API_KEY?.trim(); 

        if (!API_KEY) return res.status(500).json({ error: "Ministry API Key missing." });
        if (!image) return res.status(400).json({ error: "No portrait provided." });

        console.log("Casting spell: Dispatching to Segmind...");

        // Clean the Base64 string so Segmind doesn't panic
        const cleanBase64 = image.replace(/^data:image\/\w+;base64,/, "");

        const controller = new AbortController();
        const timeoutId = setTimeout(() => { controller.abort(); }, 45000); 

        try {
            const response = await fetch("https://api.segmind.com/v1/live-portrait", {
                method: 'POST',
                headers: { 
                    'x-api-key': API_KEY, 
                    'Content-Type': 'application/json' 
                },
                body: JSON.stringify({
                    input_image: cleanBase64, 
                    driving_video: "https://segmind-sd-models.s3.amazonaws.com/liveportrait/driving_video.mp4",
                    stitch: true,
                    live_portrait_multiplier: 1.0,
                    base64: true // This is TRUE because the phone sends Base64 text
                }),
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);

            const data = await response.json();
            console.log("Raw Segmind Data:", JSON.stringify(data).substring(0, 300));

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
                throw new Error("Segmind took too long and timed out (45s).");
            }
            throw fetchError;
        }

    } catch (err) {
        console.error("Spell Failure:", err.message);
        res.status(500).json({ error: err.message });
    }
});

// 4. Status Polling Route
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