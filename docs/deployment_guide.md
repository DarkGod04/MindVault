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
   - `JWT_SECRET`: *[A long secure random string, e.g., run `openssl rand -hex 32` in your terminal]*
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
   - Name: `VITE_API_URL`
   - Value: *[Your Render backend URL (e.g., `https://mindvault-backend.onrender.com`)]*
6. Click **Deploy**.
7. Vercel will compile and host the app, providing a production URL (e.g., `https://your-mindvault.vercel.app`).

---

## 🔒 Step 4: Secure CORS (Final Polish)

To prevent unauthorized domains from hitting your backend API:
1. Go to your **Render Dashboard** for the backend service.
2. Navigate to **Environment**.
3. Update the `CORS_ORIGINS` variable to match your newly generated Vercel production URL (e.g., `https://your-mindvault.vercel.app`).
4. Save the changes. Render will redeploy automatically with CORS protection fully enabled!
