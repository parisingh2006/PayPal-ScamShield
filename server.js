const express = require("express");
const dotenv = require("dotenv");
const { GoogleGenAI } = require("@google/genai");

const {
    Client,
    Environment,
    OrdersController
} = require("@paypal/paypal-server-sdk");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static("public"));

// ============================================
// GEMINI AI SETUP
// ============================================

const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY
});

// ============================================
// PAYPAL SANDBOX SETUP
// ============================================

const paypalClient = new Client({
    clientCredentialsAuthCredentials: {
        oAuthClientId: process.env.PAYPAL_CLIENT_ID,
        oAuthClientSecret: process.env.PAYPAL_CLIENT_SECRET
    },
    environment: Environment.Sandbox
});

const ordersController = new OrdersController(paypalClient);

// ============================================
// HOME PAGE
// ============================================

app.get("/", (req, res) => {
    res.sendFile(__dirname + "/public/index.html");
});

// ============================================
// HEALTH CHECK
// ============================================

app.get("/api/health", (req, res) => {
    res.json({
        success: true,
        message: "ScamShield server is running"
    });
});

// ============================================
// AI PAYMENT ANALYSIS
// ============================================

app.post("/api/analyze", async (req, res) => {
    try {

        const {
            merchant,
            amount,
            description,
            knownMerchant
        } = req.body;

        // Validate input
        if (
            !merchant ||
            amount === undefined ||
            amount === null ||
            !description ||
            typeof knownMerchant !== "boolean"
        ) {
            return res.status(400).json({
                success: false,
                message: "Missing payment information."
            });
        }

        // ========================================
        // AI PROMPT
        // ========================================

        const prompt = `
You are ScamShield, an AI payment safety assistant.

Analyze the following payment for potential warning signs.

Merchant: ${merchant}
Amount: $${amount}
Description: ${description}
Known merchant: ${knownMerchant ? "Yes" : "No"}

This is an AI risk-analysis prototype, NOT a fraud detection system.

Do not claim that the merchant is fraudulent.
Do not invent information about the merchant.
Base your analysis only on the information provided.

Return ONLY valid JSON in this exact structure:

{
  "riskLevel": "LOW",
  "score": 20,
  "reasons": [
    "reason 1",
    "reason 2"
  ],
  "recommendation": "Short recommendation"
}

Rules:
- riskLevel must be LOW, MEDIUM, or HIGH.
- score must be a number between 0 and 100.
- provide 2 to 4 reasons.
- recommendation must be short.
`;

        // ========================================
        // CALL GEMINI
        // ========================================

        let response;

        try {

            response = await ai.models.generateContent({
                model: "gemini-3.5-flash",
                contents: prompt
            });

        } catch (aiError) {

            console.error(
                "Gemini API error:",
                aiError
            );

            return res.status(503).json({
                success: false,
                message:
                    "The AI service is temporarily busy. Please try again in a moment."
            });
        }

        // ========================================
        // READ AI RESPONSE
        // ========================================

        const text = response.text;

        if (!text) {
            throw new Error(
                "Gemini returned an empty response."
            );
        }

        const cleanText = text
            .replace(/```json/gi, "")
            .replace(/```/g, "")
            .trim();

        const analysis = JSON.parse(cleanText);

        // ========================================
        // VALIDATE AI RESULT
        // ========================================

        if (
            !["LOW", "MEDIUM", "HIGH"].includes(
                analysis.riskLevel
            )
        ) {
            throw new Error(
                "Invalid risk level returned by Gemini."
            );
        }

        if (
            typeof analysis.score !== "number" ||
            analysis.score < 0 ||
            analysis.score > 100
        ) {
            throw new Error(
                "Invalid risk score returned by Gemini."
            );
        }

        if (
            !Array.isArray(analysis.reasons) ||
            analysis.reasons.length < 2
        ) {
            throw new Error(
                "Invalid reasons returned by Gemini."
            );
        }

        if (
            typeof analysis.recommendation !== "string" ||
            !analysis.recommendation.trim()
        ) {
            throw new Error(
                "Invalid recommendation returned by Gemini."
            );
        }

        // ========================================
        // SEND RESULT TO FRONTEND
        // ========================================

        res.json({
            success: true,

            analysis: {
                riskLevel: analysis.riskLevel,
                score: analysis.score,
                reasons: analysis.reasons,
                recommendation: analysis.recommendation
            }
        });

    } catch (error) {

        console.error(
            "AI analysis error:",
            error
        );

        res.status(500).json({
            success: false,
            message:
                "Unable to complete AI payment analysis."
        });
    }
});

// ============================================
// PAYPAL CLIENT ID
// ============================================

app.get("/api/paypal/client-id", (req, res) => {

    if (!process.env.PAYPAL_CLIENT_ID) {

        return res.status(500).json({
            success: false,
            message:
                "PayPal Client ID is not configured."
        });
    }

    res.json({
        success: true,
        clientId: process.env.PAYPAL_CLIENT_ID
    });
});

// ============================================
// PAYPAL CREATE ORDER
// ============================================

app.post("/api/paypal/create-order", async (req, res) => {

    try {

        const { amount } = req.body;

        if (
            !amount ||
            Number(amount) <= 0
        ) {

            return res.status(400).json({
                success: false,
                message:
                    "Invalid payment amount."
            });
        }

        const orderRequest = {

            intent: "CAPTURE",

            purchaseUnits: [
                {
                    amount: {
                        currencyCode: "USD",
                        value:
                            Number(amount).toFixed(2)
                    }
                }
            ]
        };

        const response =
            await ordersController.createOrder({
                body: orderRequest
            });

        res.json({
            success: true,
            orderId:
                response.result.id
        });

    } catch (error) {

        console.error(
            "PayPal create order error:",
            error
        );

        res.status(500).json({
            success: false,
            message:
                "Unable to create PayPal order."
        });
    }
});

// ============================================
// PAYPAL CAPTURE ORDER
// ============================================

app.post("/api/paypal/capture-order", async (req, res) => {

    try {

        const { orderId } = req.body;

        if (!orderId) {

            return res.status(400).json({
                success: false,
                message:
                    "PayPal order ID is required."
            });
        }

        const response =
            await ordersController.captureOrder({
                id: orderId,
                prefer: "return=minimal"
            });

        res.json({
            success: true,
            orderId:
                response.result.id,
            status:
                response.result.status
        });

    } catch (error) {

        console.error(
            "PayPal capture order error:",
            error
        );

        res.status(500).json({
            success: false,
            message:
                "Unable to capture PayPal payment."
        });
    }
});

// ============================================
// START SERVER
// ============================================

app.listen(PORT, "127.0.0.1", () => {

    console.log("================================");
    console.log("   SCAMSHIELD SERVER RUNNING");
    console.log("================================");
    console.log(
        `http://localhost:${PORT}`
    );
});