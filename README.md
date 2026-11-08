# PayPal ScamShield

PayPal ScamShield is an AI-powered payment safety assistant that analyzes payment details before a user completes a PayPal payment.

## What It Does

The user enters:
- Merchant name
- Payment amount
- Payment description
- Whether the merchant is known

ScamShield uses Gemini AI to analyze the information and provide:
- Risk level
- Risk score
- Warning signs
- Safety recommendation

If the user chooses to continue, the application opens PayPal Sandbox checkout.

## Technologies Used

- Node.js
- Express.js
- JavaScript
- HTML/CSS
- Gemini AI
- PayPal Sandbox
- PayPal Orders API
- PayPal JavaScript SDK

## How to Run

### 1. Install dependencies

```bash
npm install