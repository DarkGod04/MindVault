# 🌐 MindVault Production Deployment Guide

This guide walks you through setting up a production-ready deployment of MindVault using **Neon PostgreSQL** (database), **Render** (FastAPI backend), and **Vercel** (React frontend).

---

## 📂 Step 1: Database Setup (Neon PostgreSQL)

Render's file system is transient, meaning SQLite database files will be wiped whenever the server restarts. To persist user accounts in production, you should use a PostgreSQL database.

1. Go to [Neon.tech](https://neon.tech/) and create a free account.
2. Create a new project (e.g., named `mindvault-db`).
3. Select the latest PostgreSQL version.
4. Copy the **Connection String** from your Neon dashboard. It should look like this:
   ```
   postgresql://[user]:[password]@[host]/[dbname]?sslmode=require
   ```
5. Save this connection string safely; you will configure it as `DATABASE_URL` in Render.

---

## 🖥️ Step 2: Backend Setup (Render)

Render will build and host our FastAPI service using the custom `Dockerfile`.

1. Sign up/Log in to [Render](https://render.com/).
2. Click **New +** and select **Web Service**.
3. Connect your GitHub account and select your **MindVault** repository.
4. Configure the Web Service settings:
   - **Name**: `mindvault-backend`
   - **Environment**: `Docker`
   - **Dockerfile Path**: `backend/Dockerfile`
   - **Docker Build Context**: `.` (leave as root)
   - **Instance Type**: `Free`
5. Click **Advanced** to add the following **Environment Variables**:
   - `DATABASE_URL`: *[Your Neon Connection String]*
   - `JWT_SECRET`: *[A long secure random string, e.g., run `python -c "import secrets; print(secrets.token_hex(32))"` in your terminal]*
   - `GEMINI_API_KEY`: *[Your Google AI Studio API key]*
   - `CORS_ORIGINS`: *[Your Vercel URL (e.g. `https://your-mindvault.vercel.app` - you can update this after Vercel is set up)]*
6. Click **Create Web Service**.
7. Once deployed, Render will provide a public URL (e.g., `https://mindvault-backend.onrender.com`). Copy this URL.

---

## 🎨 Step 3: Frontend Setup (Vercel)

Vercel will build and host the React + TypeScript frontend statically.

1. Go to [Vercel](https://vercel.com/) and log in with GitHub.
2. Click **Add New** -> **Project**.
3. Import your **MindVault** repository.
4. Configure the project settings:
   - **Framework Preset**: `Vite`
   - **Root Directory**: `frontend`
5. Expand the **Environment Variables** section and add:
   - **Name**: `VITE_API_URL`
   - **Value**: *[Your Render backend URL (e.g., `https://mindvault-backend.onrender.com`)]*
   - **Name**: `VITE_GOOGLE_CLIENT_ID`
   - **Value**: *[Your Google Client ID from Google Cloud Console (e.g., `766662978879-...apps.googleusercontent.com`)]*
6. Click **Deploy**.
7. Vercel will compile and host the app, providing a production URL (e.g., `https://your-mindvault.vercel.app`).

---

## 🔒 Step 4: Secure CORS (Final Polish)

To prevent unauthorized domains from hitting your backend API:
1. Go to your **Render Dashboard** for the backend service.
2. Navigate to **Environment**.
3. Update the `CORS_ORIGINS` variable to match your newly generated Vercel production URL (e.g., `https://your-mindvault.vercel.app`).
4. Save the changes. Render will redeploy automatically with CORS protection fully enabled!

---

## 🔑 Step 5: Google OAuth Setup (For Google Sign-In)

If Google Sign-In works in development but fails in production, it is because Google's servers reject requests originating from your newly deployed Vercel domain.

1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Select your project and navigate to **APIs & Services** -> **Credentials**.
3. Under **OAuth 2.0 Client IDs**, click the edit icon (pencil) next to your Client ID.
4. Scroll down to the **Authorized JavaScript Origins** section.
5. Click **+ ADD URI** and enter your deployed Vercel frontend URL:
   - For example: `https://your-mindvault.vercel.app`
   - *Note: Do not include a trailing slash `/` at the end of the URL.*
6. Click **Save** at the bottom of the page.
7. *Note: It may take 5–10 minutes for Google to update its global DNS cache and recognize the new origin. Clear your browser cache and cookies if you still see errors immediately after saving.*

