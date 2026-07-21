const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type PackageDetails = {
  lessons: number;
  price: string;
};

const packages: Record<string, PackageDetails> = {
  package_1: {
    lessons: 1,
    price: "6.00",
  },
  package_5: {
    lessons: 5,
    price: "30.00",
  },
  package_20: {
    lessons: 20,
    price: "120.00",
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
    const body = await request.json();
    const packageId = body?.packageId;

    if (typeof packageId !== "string") {
      return jsonResponse(
        { error: "Package ID is required." },
        400,
      );
    }

    const selectedPackage = packages[packageId];

    if (!selectedPackage) {
      return jsonResponse(
        { error: "Invalid lesson package." },
        400,
      );
    }

    const accessToken = await getPayPalAccessToken();

    const orderResponse = await fetch(
      `${getPayPalBaseUrl()}/v2/checkout/orders`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "PayPal-Request-Id": crypto.randomUUID(),
        },
        body: JSON.stringify({
          intent: "CAPTURE",
          purchase_units: [
            {
              reference_id: packageId,
              custom_id: packageId,
              description:
                `${selectedPackage.lessons} Polyglot language lessons`,
              amount: {
                currency_code: "EUR",
                value: selectedPackage.price,
              },
            },
          ],
        }),
      },
    );

    const order = await orderResponse.json();

    if (!orderResponse.ok || !order.id) {
      console.error("PayPal create order error:", order);

      return jsonResponse(
        {
          error: "Unable to create PayPal order.",
          details: order,
        },
        orderResponse.status || 500,
      );
    }

    return jsonResponse({
      orderId: order.id,
      packageId,
      lessons: selectedPackage.lessons,
    });
  } catch (error) {
    console.error("Create PayPal order error:", error);

    return jsonResponse(
      {
        error: error instanceof Error
          ? error.message
          : "Unexpected server error.",
      },
      500,
    );
  }
});