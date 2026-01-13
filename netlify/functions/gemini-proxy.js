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

    // 2. Get API Key from environment variables (Server key - fallback)
    const SERVER_GEMINI_API_KEY = process.env.GEMINI_API_KEY;

    // 3. Parse Request Body (moved up to check for user key)
    let payload;
    try {
        payload = JSON.parse(event.body);
    } catch (e) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: 'Invalid JSON payload.' }),
        };
    }
    
    // 2.1 Check for user-provided key (Priority 1)
    const USER_GEMINI_API_KEY = payload.userApiKey;
    
    // Determine the key to use: User key > Server key (if available)
    const API_KEY_TO_USE = USER_GEMINI_API_KEY || SERVER_GEMINI_API_KEY;

    if (!API_KEY_TO_USE) {
        console.error("No API key provided by user or found on server.");
        return {
            statusCode: 401,
            body: JSON.stringify({ error: 'API key required. Please configure your key on the frontend or ensure the server key is set.' }),
        };
    }

    // IMPORTANT: Remove the userApiKey from the payload before forwarding 
    // it to the Gemini API, as it is only needed for authentication in the URL.
    delete payload.userApiKey; 
    
    // 4. Construct API URL
    const model = 'gemini-2.5-flash-preview-09-2025';
    // Use the determined key in the URL
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${API_KEY_TO_USE}`;

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