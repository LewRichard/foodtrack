# Selling Premium with Paddle

Paddle is the Merchant of Record: it takes the payment, charges and pays the right sales tax/VAT in each
country, sends receipts and handles refunds. FoodTrack only hears "this person's subscription is active /
cancelled" through a signed webhook and turns Premium on or off.

Before you start, have these live (Paddle checks them when approving your account):

- your own domain with the app on it (e.g. `https://foodtrack.team`)
- `/pricing.html`, `/terms.html`, `/refund.html`, `/privacy.html` (already in the app)
- a support email on the pages (currently the one in the Terms and Privacy pages)

## 1. Try it in the sandbox first

1. Create a sandbox account at https://sandbox-login.paddle.com/signup (free; no real money moves).
2. **Catalog → Products → New product**: name "FoodTrack Premium", tax category **Standard digital goods**
   (or "SaaS"). Add two prices:
   - Monthly: recurring, every 1 month, e.g. USD 4.99
   - Yearly: recurring, every 1 year, e.g. USD 39.99
   Optional: under each price, **Override price for specific countries** (e.g. a lower VND price for Vietnam).
   Copy both price ids (they start with `pri_`).
3. **Developer tools → Authentication**:
   - **Client-side tokens → New client-side token** → copy it (starts with `test_` in sandbox).
   - **API keys → New API key** with permission to read customers and create customer portal sessions →
     copy it. (Optional; it powers the "Manage subscription" button.)
4. **Developer tools → Notifications → New destination**:
   - URL: `https://YOUR-DOMAIN/api/paddle/webhook`
   - Events: all **subscription.*** events (created, updated, activated, canceled, paused, resumed, past_due)
   - Save, then open it and copy the **secret key**.
5. **Checkout → Checkout settings**: set **Default payment link** to `https://YOUR-DOMAIN/` and add your
   domain under approved domains.
6. On Render → Environment, set and redeploy:

   | Key | Value |
   |---|---|
   | `PADDLE_CLIENT_TOKEN` | the client-side token |
   | `PADDLE_PRICE_MONTHLY` | monthly price id |
   | `PADDLE_PRICE_YEARLY` | yearly price id |
   | `PADDLE_WEBHOOK_SECRET` | the notification secret |
   | `PADDLE_API_KEY` | the API key (optional) |

   A token starting with `test_` puts everything in sandbox mode automatically.
7. In the app: Profile → Your plan → pick a plan → Upgrade. Pay with Paddle's test card
   `4242 4242 4242 4242`, any future expiry, CVC `100`. Within a few seconds the plan shows Premium.
   Cancel from **Manage subscription** to check it turns off.

## 2. Go live

1. Sign up at https://login.paddle.com/signup and complete **verification** (identity, website review).
   Paddle reviews the website: make sure the pages above are reachable on your domain.
2. Repeat steps 2–5 in the live dashboard (live ids and tokens are different from sandbox).
3. Replace the five values on Render with the live ones (the client token starts with `live_`), redeploy.

## Notes

- Never put `PADDLE_WEBHOOK_SECRET` or `PADDLE_API_KEY` in the app's code or a screenshot. The client-side
  token and price ids are public by design.
- Premium is set to the end of the paid period plus 3 days, and extended by each renewal webhook, so a late
  webhook doesn't cut anyone off. Cancelling ends it when Paddle sends `subscription.canceled` (at the end of
  the paid period).
- Premium you granted by hand in SQL (`source = 'manual'`) is never removed by Paddle events.
- iPhone app: Apple requires its own in-app purchase for subscriptions bought inside the app, so the buy
  button is hidden there.
