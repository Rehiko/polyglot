import { createClient } from "npm:@supabase/supabase-js@2";

type BookingRecord = {
  id: string;
  status: string;
  google_event_id: string | null;
  meeting_url: string | null;
  meeting_status: string | null;
};

type WebhookPayload = {
  type: "UPDATE";
  table: string;
  schema: string;
  record: BookingRecord;
  old_record: BookingRecord;
};

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

function secureCompare(first: string, second: string) {
  if (first.length !== second.length) {
    return false;
  }

  let difference = 0;

  for (let index = 0; index < first.length; index += 1) {
    difference |=
      first.charCodeAt(index) ^ second.charCodeAt(index);
  }

  return difference === 0;
}

async function getGoogleAccessToken(
  clientId: string,
  clientSecret: string,
  refreshToken: string
) {
  const response = await fetch(
    "https://oauth2.googleapis.com/token",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token"
      })
    }
  );

  const data = await response.json();

  if (!response.ok || !data.access_token) {
    console.error(
      "Google token refresh failed:",
      response.status,
      data.error
    );

    throw new Error(
      "Google Calendar authorization could not be refreshed."
    );
  }

  return data.access_token as string;
}

async function deleteGoogleCalendarEvent(
  accessToken: string,
  eventId: string
) {
  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}?sendUpdates=all`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    }
  );

  if (
    response.status === 204 ||
    response.status === 404 ||
    response.status === 410
  ) {
    return;
  }

  const errorText = await response.text();

  console.error(
    "Google Calendar event deletion failed:",
    response.status,
    errorText
  );

  throw new Error(
    "The Google Calendar event could not be cancelled."
  );
}

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return jsonResponse(
      {
        error: "Method not allowed."
      },
      405
    );
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey =
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const googleClientId =
      Deno.env.get("GOOGLE_CLIENT_ID");
    const googleClientSecret =
      Deno.env.get("GOOGLE_CLIENT_SECRET");
    const googleRefreshToken =
      Deno.env.get("GOOGLE_REFRESH_TOKEN");

    if (
      !supabaseUrl ||
      !serviceRoleKey ||
      !googleClientId ||
      !googleClientSecret ||
      !googleRefreshToken
    ) {
      throw new Error(
        "Required Edge Function secrets are missing."
      );
    }

    const authorization =
      request.headers.get("Authorization") || "";

    if (
      !secureCompare(
        authorization,
        `Bearer ${serviceRoleKey}`
      )
    ) {
      return jsonResponse(
        {
          error: "Invalid webhook authorization."
        },
        401
      );
    }

    const payload =
      await request.json() as WebhookPayload;

    if (
      payload.type !== "UPDATE" ||
      payload.schema !== "public" ||
      payload.table !== "lesson_bookings" ||
      !payload.record ||
      !payload.old_record
    ) {
      return jsonResponse(
        {
          ignored: true,
          reason: "Unsupported webhook payload."
        }
      );
    }

    const booking = payload.record;
    const previousBooking = payload.old_record;

    if (
      booking.status !== "cancelled" ||
      previousBooking.status === "cancelled"
    ) {
      return jsonResponse({
        ignored: true,
        reason: "Booking was not newly cancelled."
      });
    }

    const supabaseAdmin = createClient(
      supabaseUrl,
      serviceRoleKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false
        }
      }
    );

    if (booking.google_event_id) {
      const googleAccessToken =
        await getGoogleAccessToken(
          googleClientId,
          googleClientSecret,
          googleRefreshToken
        );

      await deleteGoogleCalendarEvent(
        googleAccessToken,
        booking.google_event_id
      );
    }

    const { error: updateError } =
      await supabaseAdmin
        .from("lesson_bookings")
        .update({
          meeting_url: null,
          meeting_status: "cancelled"
        })
        .eq("id", booking.id);

    if (updateError) {
      console.error(
        "Booking meeting status update failed:",
        updateError
      );

      throw new Error(
        "The Calendar event was cancelled, but the booking could not be updated."
      );
    }

    return jsonResponse({
      cancelled: true,
      booking_id: booking.id,
      google_event_deleted: Boolean(
        booking.google_event_id
      )
    });
  } catch (error) {
    console.error(
      "cancel-google-meet failed:",
      error
    );

    return jsonResponse(
      {
        error:
          error instanceof Error
            ? error.message
            : "Google Calendar cancellation failed."
      },
      500
    );
  }
});