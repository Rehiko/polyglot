import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type PackageDetails = {
  lessons: number;
  testAmount: string;
  currency: string;
};

const packages: Record<string, PackageDetails> = {
  package_1: {
    lessons: 1,
    testAmount: "1.00",
    currency: "EUR",
  },
  package_5: {
    lessons: 5,
    testAmount: "2.00",
    currency: "EUR",
  },
  package_20: {
    lessons: 20,
    testAmount: "3.00",
    currency: "EUR",
  },
};

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function getPayPalBaseUrl(): string {
  const environment = Deno.env.get("PAYPAL_ENV") ?? "sandbox";

  return environment === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";
}

async function getPayPalAccessToken(): Promise<string> {
  const clientId = Deno.env.get("PAYPAL_CLIENT_ID");
  const clientSecret = Deno.env.get("PAYPAL_CLIENT_SECRET");

  if (!clientId || !clientSecret) {
    throw new Error("PayPal Client ID or Secret is missing.");
  }

  const credentials = btoa(`${clientId}:${clientSecret}`);

  const response = await fetch(
    `${getPayPalBaseUrl()}/v1/oauth2/token`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    },
  );

  const data = await response.json();

  if (!response.ok || !data.access_token) {
    console.error("PayPal authentication error:", data);
    throw new Error("Unable to authenticate with PayPal.");
  }

  return data.access_token;
}

async function getPayPalOrder(
  orderId: string,
  accessToken: string,
): Promise<any> {
  const response = await fetch(
    `${getPayPalBaseUrl()}/v2/checkout/orders/${
      encodeURIComponent(orderId)
    }`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    },
  );

  const data = await response.json();

  if (!response.ok) {
    console.error("PayPal get order error:", data);
    throw new Error("Unable to retrieve the PayPal order.");
  }

  return data;
}

async function capturePayPalOrder(
  orderId: string,
  accessToken: string,
): Promise<any> {
  const response = await fetch(
    `${getPayPalBaseUrl()}/v2/checkout/orders/${
      encodeURIComponent(orderId)
    }/capture`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "PayPal-Request-Id": `capture-${orderId}`,
      },
    },
  );

  const data = await response.json();

  if (response.ok) {
    return data;
  }

  /*
   * PayPal may report that the order was already captured.
   * We then retrieve it and continue only if its status is COMPLETED.
   */
  console.warn("PayPal capture response:", data);

  const existingOrder = await getPayPalOrder(orderId, accessToken);

  if (existingOrder.status === "COMPLETED") {
    return existingOrder;
  }

  throw new Error(
    data?.details?.[0]?.description ||
      data?.message ||
      "Unable to capture the PayPal payment.",
  );
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

  if (request.method !== "POST") {
    return jsonResponse(
      { error: "Method not allowed." },
      405,
    );
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      throw new Error("Supabase environment variables are missing.");
    }

    const authorization = request.headers.get("Authorization");

    if (!authorization) {
      return jsonResponse(
        { error: "You must be logged in to complete this payment." },
        401,
      );
    }

    /*
     * This client uses the customer's authorization token.
     * getUser() verifies who made the request.
     */
    const userClient = createClient(supabaseUrl, anonKey, {
      global: {
        headers: {
          Authorization: authorization,
        },
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const { data: userData, error: userError } =
      await userClient.auth.getUser();

    if (userError || !userData.user) {
      console.error("User authentication error:", userError);

      return jsonResponse(
        { error: "Your login session is invalid or has expired." },
        401,
      );
    }

    const studentId = userData.user.id;

    const { data: profile, error: profileError } = await userClient
      .from("profiles")
      .select("role")
      .eq("id", studentId)
      .single();

    if (profileError || profile?.role !== "student") {
      return jsonResponse(
        { error: "Lesson packages can be purchased only by students." },
        403,
      );
    }

    const body = await request.json();
    const orderId = body?.orderId;

    if (typeof orderId !== "string" || !orderId.trim()) {
      return jsonResponse(
        { error: "PayPal order ID is required." },
        400,
      );
    }

    const accessToken = await getPayPalAccessToken();

    const captureData = await capturePayPalOrder(
      orderId.trim(),
      accessToken,
    );

    if (captureData.status !== "COMPLETED") {
      return jsonResponse(
        {
          error: "PayPal has not completed this payment.",
          status: captureData.status,
        },
        400,
      );
    }

    const purchaseUnit = captureData.purchase_units?.[0];
    const paymentCapture =
      purchaseUnit?.payments?.captures?.[0];

    const packageId =
      purchaseUnit?.reference_id ??
      purchaseUnit?.custom_id;

    const selectedPackage = packages[packageId];

    if (!selectedPackage) {
      console.error("Invalid PayPal package:", packageId);

      return jsonResponse(
        { error: "The paid lesson package is invalid." },
        400,
      );
    }

    const captureId = paymentCapture?.id;
    const capturedAmount = paymentCapture?.amount?.value;
    const capturedCurrency =
      paymentCapture?.amount?.currency_code;

    if (!captureId || !capturedAmount || !capturedCurrency) {
      console.error("Incomplete PayPal capture:", captureData);

      return jsonResponse(
        { error: "PayPal returned incomplete payment information." },
        400,
      );
    }

    /*
     * Sandbox protection:
     * package_1  = €1
     * package_5  = €2
     * package_20 = €3
     */
    if (
      capturedAmount !== selectedPackage.testAmount ||
      capturedCurrency.toUpperCase() !== selectedPackage.currency
    ) {
      console.error("Payment amount mismatch:", {
        packageId,
        capturedAmount,
        capturedCurrency,
      });

      return jsonResponse(
        { error: "The PayPal payment amount does not match the package." },
        400,
      );
    }

    /*
     * The service-role client may call the protected database function.
     * It is never exposed in the browser.
     */
    const adminClient = createClient(
      supabaseUrl,
      serviceRoleKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      },
    );

    const { data: completionData, error: completionError } =
      await adminClient.rpc("complete_paypal_purchase", {
        p_student_id: studentId,
        p_paypal_order_id: captureData.id,
        p_paypal_capture_id: captureId,
        p_package_id: packageId,
        p_lessons: selectedPackage.lessons,
        p_paypal_amount: Number(capturedAmount),
        p_paypal_currency: capturedCurrency,
      });

    if (completionError) {
      console.error(
        "Complete purchase database error:",
        completionError,
      );

      return jsonResponse(
        {
          error:
            "Payment was confirmed, but the lessons could not be added. Please contact Polyglot support.",
        },
        500,
      );
    }

    const result = Array.isArray(completionData)
      ? completionData[0]
      : completionData;

    return jsonResponse({
      success: true,
      orderId: captureData.id,
      captureId,
      packageId,
      lessonsAdded: selectedPackage.lessons,
      newBalance: result?.new_balance ?? null,
      amount: capturedAmount,
      currency: capturedCurrency,
    });
  } catch (error) {
    console.error("Capture PayPal order error:", error);

    return jsonResponse(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unexpected server error.",
      },
      500,
    );
  }
});