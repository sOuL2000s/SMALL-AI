// File: netlify/functions/gemini-proxy.js

// Using native Node.js fetch (available in Netlify's modern Node environments)
// The 'const fetch = require('node-fetch');' line is REMOVED.

exports.handler = async (event, context) => {
    // 1. Check HTTP Method
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            body: JSON.stringify({ error: 'Method Not Allowed' }),
        };
    }

    // 2. Get API Key from environment variables (SECURE!)
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

    if (!GEMINI_API_KEY) {
        console.error("GEMINI_API_KEY is not set in Netlify environment variables.");
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Server configuration error: API key missing.' }),
        };
    }

    // 3. Parse Request Body
    let payload;
    try {
        payload = JSON.parse(event.body);
    } catch (e) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: 'Invalid JSON payload.' }),
        };
    }

    // 4. Construct API URL
    const model = 'gemini-2.5-flash-preview-09-2025';
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;

    try {
        // 5. Call the Gemini API using native fetch
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });

        // 6. Handle API response
        const data = await response.json();

        if (!response.ok) {
            console.error('Gemini API Error:', data);
            return {
                statusCode: response.status,
                body: JSON.stringify({ 
                    error: data.error?.message || `Gemini API returned status ${response.status}`,
                    details: data
                }),
            };
        }

        // 7. Extract and return the text result
        const textResult = data.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!textResult) {
            return {
                statusCode: 500,
                body: JSON.stringify({ error: 'AI response was empty or malformed.' }),
            };
        }

        return {
            statusCode: 200,
            // Return only the text to the client
            body: JSON.stringify({ text: textResult }), 
        };

    } catch (error) {
        console.error('Netlify Function execution error:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Internal server error during API proxy.', details: error.message }),
        };
    }
};