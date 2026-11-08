// ============================================
// SCAMSHIELD FRONTEND
// ============================================

const analyzeBtn = document.getElementById("analyzeBtn");

const paymentCard = document.getElementById("paymentCard");
const resultCard = document.getElementById("resultCard");
const paypalCard = document.getElementById("paypalCard");
const successCard = document.getElementById("successCard");

const errorMessage = document.getElementById("errorMessage");
const paypalMessage = document.getElementById("paypalMessage");

const riskLevel = document.getElementById("riskLevel");
const riskScore = document.getElementById("riskScore");
const riskMessage = document.getElementById("riskMessage");
const reasonsList = document.getElementById("reasonsList");

const continueBtn = document.getElementById("continueBtn");
const cancelBtn = document.getElementById("cancelBtn");
const newPaymentBtn = document.getElementById("newPaymentBtn");

let paymentData = null;
let paypalButtonsLoaded = false;


// ============================================
// ANALYZE PAYMENT
// ============================================

analyzeBtn.addEventListener("click", async () => {

    errorMessage.textContent = "";

    const merchant =
        document.getElementById("merchant").value.trim();

    const amount =
        Number(document.getElementById("amount").value);

    const description =
        document.getElementById("description").value.trim();

    const knownMerchantInput =
        document.querySelector(
            'input[name="knownMerchant"]:checked'
        );

    const knownMerchant = knownMerchantInput
        ? knownMerchantInput.value === "yes"
        : false;


    // Validate input
    if (
        !merchant ||
        !amount ||
        amount <= 0 ||
        !description
    ) {
        errorMessage.textContent =
            "Please enter the merchant, amount and payment description.";

        return;
    }


    // Store payment information
    paymentData = {
        merchant,
        amount,
        description,
        knownMerchant
    };


    analyzeBtn.disabled = true;
    analyzeBtn.textContent = "Analyzing...";


    try {

        const response = await fetch("/api/analyze", {
            method: "POST",

            headers: {
                "Content-Type": "application/json"
            },

            body: JSON.stringify(paymentData)
        });


        const data = await response.json();


        if (!response.ok || !data.success) {
            throw new Error(
                data.message || "Analysis failed."
            );
        }


        showRiskResult(data.analysis);

    } catch (error) {

        console.error("Analysis error:", error);

        errorMessage.textContent =
            error.message ||
            "Unable to analyze payment.";

    } finally {

        analyzeBtn.disabled = false;
        analyzeBtn.textContent = "Analyze Payment";
    }
});


// ============================================
// DISPLAY AI RESULT
// ============================================

function showRiskResult(analysis) {

    riskLevel.textContent =
        analysis.riskLevel;

    riskScore.textContent =
        analysis.score;

    riskMessage.textContent =
        analysis.recommendation;


    reasonsList.innerHTML = "";


    analysis.reasons.forEach((reason) => {

        const li =
            document.createElement("li");

        li.textContent = reason;

        reasonsList.appendChild(li);
    });


    resultCard.classList.remove("hidden");

    resultCard.scrollIntoView({
        behavior: "smooth",
        block: "start"
    });
}


// ============================================
// CONTINUE WITH PAYPAL
// ============================================

continueBtn.addEventListener("click", async () => {

    if (!paymentData) {

        errorMessage.textContent =
            "Please analyze a payment first.";

        return;
    }


    resultCard.classList.add("hidden");

    paypalCard.classList.remove("hidden");

    paypalMessage.textContent =
        "Loading PayPal checkout...";


    paypalCard.scrollIntoView({
        behavior: "smooth",
        block: "start"
    });


    try {

        await loadPayPalSDK();

        renderPayPalButtons();

    } catch (error) {

        console.error("PayPal loading error:", error);

        paypalMessage.textContent =
            error.message ||
            "Unable to load PayPal checkout.";
    }
});


// ============================================
// LOAD PAYPAL JAVASCRIPT SDK
// ============================================

async function loadPayPalSDK() {

    // Already loaded
    if (window.paypal) {
        return;
    }


    // Get public Client ID from backend
    const response =
        await fetch("/api/paypal/client-id");


    const data =
        await response.json();


    if (!response.ok || !data.success) {

        throw new Error(
            data.message ||
            "Unable to get PayPal Client ID."
        );
    }


    // Load PayPal SDK
    await new Promise((resolve, reject) => {

        const script =
            document.createElement("script");


        script.src =
            "https://www.paypal.com/sdk/js" +
            "?client-id=" +
            encodeURIComponent(data.clientId) +
            "&currency=USD" +
            "&components=buttons";


        script.onload = resolve;


        script.onerror = () => {

            reject(
                new Error(
                    "PayPal JavaScript SDK failed to load."
                )
            );
        };


        document.head.appendChild(script);
    });
}


// ============================================
// RENDER PAYPAL BUTTONS
// ============================================

function renderPayPalButtons() {

    if (paypalButtonsLoaded) {
        return;
    }


    const container =
        document.getElementById(
            "paypal-button-container"
        );


    container.innerHTML = "";


    paypal.Buttons({

        // ====================================
        // CREATE PAYPAL ORDER
        // ====================================

        createOrder: async () => {

            paypalMessage.textContent =
                "Creating PayPal Sandbox order...";


            const response =
                await fetch(
                    "/api/paypal/create-order",
                    {
                        method: "POST",

                        headers: {
                            "Content-Type":
                                "application/json"
                        },

                        body: JSON.stringify({
                            amount:
                                paymentData.amount
                        })
                    }
                );


            const data =
                await response.json();


            if (
                !response.ok ||
                !data.success
            ) {

                throw new Error(
                    data.message ||
                    "Unable to create PayPal order."
                );
            }


            return data.orderId;
        },


        // ====================================
        // BUYER APPROVED PAYMENT
        // ====================================

        onApprove: async (data) => {

            paypalMessage.textContent =
                "Completing Sandbox payment...";


            try {

                const response =
                    await fetch(
                        "/api/paypal/capture-order",
                        {
                            method: "POST",

                            headers: {
                                "Content-Type":
                                    "application/json"
                            },

                            body: JSON.stringify({
                                orderId:
                                    data.orderID
                            })
                        }
                    );


                const result =
                    await response.json();


                if (
                    !response.ok ||
                    !result.success
                ) {

                    throw new Error(
                        result.message ||
                        "Payment capture failed."
                    );
                }


                showPaymentSuccess(
                    result.orderId
                );

            } catch (error) {

                console.error(
                    "PayPal capture error:",
                    error
                );


                paypalMessage.textContent =
                    error.message ||
                    "Payment could not be completed.";
            }
        },


        // ====================================
        // BUYER CANCELLED
        // ====================================

        onCancel: () => {

            paypalMessage.textContent =
                "Payment was cancelled.";

        },


        // ====================================
        // PAYPAL ERROR
        // ====================================

        onError: (error) => {

            console.error(
                "PayPal checkout error:",
                error
            );


            paypalMessage.textContent =
                "PayPal checkout encountered an error.";
        }

    }).render(
        "#paypal-button-container"
    );


    paypalButtonsLoaded = true;
}


// ============================================
// PAYMENT SUCCESS
// ============================================

function showPaymentSuccess(orderId) {

    paymentCard.classList.add("hidden");

    resultCard.classList.add("hidden");

    paypalCard.classList.add("hidden");


    document.getElementById(
        "orderId"
    ).textContent = orderId;


    successCard.classList.remove("hidden");


    successCard.scrollIntoView({
        behavior: "smooth",
        block: "start"
    });
}


// ============================================
// CANCEL PAYMENT
// ============================================

cancelBtn.addEventListener("click", () => {

    resultCard.classList.add("hidden");

    paypalCard.classList.add("hidden");

    errorMessage.textContent = "";

    paymentCard.scrollIntoView({
        behavior: "smooth",
        block: "start"
    });
});


// ============================================
// NEW PAYMENT
// ============================================

newPaymentBtn.addEventListener("click", () => {

    paymentData = null;

    paypalButtonsLoaded = false;


    document.getElementById(
        "merchant"
    ).value = "";

    document.getElementById(
        "amount"
    ).value = "";

    document.getElementById(
        "description"
    ).value = "";


    document.querySelector(
        'input[name="knownMerchant"][value="no"]'
    ).checked = true;


    errorMessage.textContent = "";

    paypalMessage.textContent = "";


    successCard.classList.add("hidden");

    paypalCard.classList.add("hidden");

    resultCard.classList.add("hidden");

    paymentCard.classList.remove("hidden");


    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });
});