# BhuMitra Explorer

A React cadastral explorer for Maharashtra. District, taluka, village and parcel data are loaded from the documented MRSAC Lambda API. Google Maps renders the map and parcel boundaries.

## Run locally

```sh
npm install
npm start
```

`npm start` starts both the React app and its local API proxy on port 4242, so the MRSAC dropdowns work without starting a second process.

To enable the interactive Google map with parcel overlays, create a Google Maps JavaScript API key, enable Maps JavaScript API and set its website referrer restrictions. Put `REACT_APP_GOOGLE_MAPS_API_KEY=your_key` in `.env.local` before starting the React app. Without the key, the app shows a Google Maps embed; parcel overlays need the JavaScript API key.

Payment currently runs in test mode by default: clicking Continue marks access as active without making a charge. To switch to Razorpay checkout, set `REACT_APP_PAYMENT_TEST_MODE=false` in `.env.local`, then provide test or live credentials to the server:

```sh
REACT_APP_PAYMENT_TEST_MODE=false RAZORPAY_KEY_ID=rzp_test_... RAZORPAY_KEY_SECRET=... npm start
```

The React development server proxies `/api` to `http://localhost:4242`. The Node server proxies `/api/mrsac/*` to the documented Lambda Function URL, avoiding the Lambda CORS origin restriction during local development. Set `MRSAC_API_BASE` if your Lambda Function URL changes. The PDF documents `GET /api/health`, `/api/districts`, `/api/stats`, `/api/talukas?district=…`, `/api/villages?district=…&taluka=…`, and `/api/plots?district=…&taluka=…&village=…`. The UI passes metadata IDs through as strings to preserve leading zeros.

`RAZORPAY_KEY_SECRET` stays on the server. Set `RAZORPAY_AMOUNT_PAISE` to change the server controlled checkout price (defaults to ₹99). The payment API returns a verified signature, but production access entitlement should be granted from a server side webhook after confirming the payment status with Razorpay.

For production, deploy the React build and the Node API behind the same origin or configure a reverse proxy for `/api`. Set `APP_ORIGIN` to your site origin if the API is called cross-origin. Keep the Razorpay secret in the server environment, never in a `REACT_APP_*` variable.

The Lambda Function URL authentication mode should be confirmed with its owner as noted in the API reference. Parcel area and PIN values are displayed as supplied by the source and are not certified land records.
