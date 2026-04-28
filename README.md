# The Intellectual Collective

A beautifully crafted, high-performance web application designed to centralize academic knowledge sharing, peer networking, and scholarly collaboration. 

Built for modern researchers, students, and educators, it eliminates fragmented email chains and disconnected portals in favor of a unified digital athenaeum.

---

##  Table of Contents

- [The Intellectual Collective](#the-intellectual-collective)
  - [ Table of Contents](#-table-of-contents)
  - [ Comprehensive Features](#-comprehensive-features)
    - [1. Frictionless Authentication (Google OAuth 2.0)](#1-frictionless-authentication-google-oauth-20)
    - [2. The Resource Library (Dashboard \& Archives)](#2-the-resource-library-dashboard--archives)
    - [3. Academic Discussions (Q\&A Board)](#3-academic-discussions-qa-board)
    - [4. Peer Networking \& Matches](#4-peer-networking--matches)
    - [5. Live Messaging](#5-live-messaging)
  - [ Technology Stack](#-technology-stack)
  - [ Project Structure](#-project-structure)
  - [ Environment Variables](#️-environment-variables)
  - [ Local Development Setup](#-local-development-setup)
    - [1. Pre-requisites](#1-pre-requisites)
    - [2. Installation](#2-installation)
    - [3. Configuration](#3-configuration)
    - [4. Running the App](#4-running-the-app)
  - [ Deployment (Render.com)](#-deployment-rendercom)
  - [ External Service Setup Guide](#-external-service-setup-guide)
    - [MongoDB Atlas](#mongodb-atlas)
    - [Google Cloud Console (OAuth)](#google-cloud-console-oauth)
    - [Cloudinary](#cloudinary)
  - [ API Reference (Highlight)](#-api-reference-highlight)
  - [ Contributing](#-contributing)
  - [ License](#-license)

---

##  Comprehensive Features

### 1. Frictionless Authentication (Google OAuth 2.0)
User onboarding is completely frictionless. We utilize the `google-auth-library` to provide one-click secure login. 
* **State Management:** Fully stateless architecture bridging the Google tokens into secure, HTTP-only JWT cookies for session management.
* **Security:** Eliminates the need to store raw passwords, mitigating brute-force attacks and significantly reducing the security footprint of the platform.

### 2. The Resource Library (Dashboard & Archives)
The core of the collective, designed for high-availability file sharing and discoverability.
* **Global Dashboard:** A real-time chronological feed highlighting the most recently shared academic materials, notes, and datasets.
* **Archives:** A structured, searchable repository. Resources are categorized by topic, author, and date.
* **Cloud Storage Integration:** File uploads directly stream to **Cloudinary**, resulting in optimal delivery speeds and offloaded bandwidth constraints from our primary server.

### 3. Academic Discussions (Q&A Board)
A dedicated, forum-style environment constructed for deep scholarly inquiry.
* **Rich Formatting:** Out-of-the-box support for **KaTeX** formatting, giving math, physics, and science scholars the ability to naturally render complex equations in browser.
* **Threaded Responses:** Keep debates and discussions focused, hierarchical, and context-rich.

### 4. Peer Networking & Matches
Finding study partners or research collaborators shouldn't be difficult. 
* **Interest-Based Discovery:** Users define their academic focuses, and the application queries MongoDB to find peers with highly overlapping tags, majors, and research interests to construct a personalized 'Matches' list.
* **Collaborator Profiles:** View comprehensive member directories to actively curate your academic network.

### 5. Live Messaging
A fully integrated, real-time communication layer powered by **Socket.IO**.
* **Instant Delivery:** Bidirectional event-driven architecture ensures chats reflect instantly without relying on HTTP polling.
* **Context Preservation:** Keeps academic conversations on the platform where the resources live, preventing users from having to pivot between different communication silos.

---

##  Technology Stack

**Frontend Framework & UI**
* **TypeScript:** Strictly typed interactions securing data flow from client to server.
* **Vite:** Next-generation frontend tooling for instantaneous Hot Module Replacement (HMR).
* **Tailwind CSS:** Utility-first framework providing our heavily customized, distraction-free scholarly UI without CSS bloat.

**Backend Architecture**
* **Node.js & Express:** High-throughput, non-blocking asynchronous event loop handling high-volume file transfers and concurrent API requests.
* **Socket.IO:** Establishing robust WebSocket connections for real-time networking with automatic fallback transport mechanisms.

**Data & Infrastructure**
* **MongoDB (Atlas):** A highly flexible NoSQL document structure perfect for diverse entity relationships (Users, Messages, Resources, Posts).
* **Mongoose ODM:** Guaranteeing schema validation and strict query formatting at the application layer.
* **Cloudinary:** Robust Media CDN for hosting avatars and user-uploaded academic materials.

---

##  Project Structure

```text
├── src/
│   ├── api/          # Express API Routers, Controllers, and middleware hooks
│   ├── config/       # Mongoose initialization & third-party service instances
│   ├── models/       # Database Schemas (User, Post, Resource, Message)
│   ├── pages/        # Distinct Frontend Views (Dashboard, Archives, Settings)
│   ├── index.css     # Global Tailwind directives & custom CSS variables
│   └── main.ts       # Frontend bootstrapping & routing logic
├── .env.example      # Sample configurations for developers
├── build-server.ts   # ESBuild configurations for compiling the backend
├── server.ts         # Backend Express server & Socket.io initialization
├── tsconfig.json     # Strict compiler rules for full-stack TS environment
└── vite.config.ts    # Build configurations for the frontend assets
```

---

##  Environment Variables

The application expects these variables to be populated in your local `.env` or in your hosting provider's Secrets Vault.

| Variable | Description | Required | Example |
| -------- | ----------- | -------- | ------- |
| `APP_URL` | The base URL of the client environment | Yes | `http://localhost:3000` |
| `MONGODB_URI` | Mongo Atlas Connection String | Yes | `mongodb+srv://...` |
| `JWT_SECRET` | Secure cryptographic key for signing sessions | Yes | `super_secret_64_byte_string` |
| `CLOUDINARY_URL` | Your full Cloudinary API formatted string | Yes | `cloudinary://API_KEY:SECRET@CLOUD_NAME` |
| `GOOGLE_CLIENT_ID` | GCP OAuth Client Identifier | Yes | `12345-abcde.apps.googleusercontent.com` |
| `GOOGLE_CLIENT_SECRET`| GCP OAuth Client Secret | Yes | `GOCSPX-SampleSecretKey` |

---

##  Local Development Setup

### 1. Pre-requisites
* NodeJS (v18 or higher recommended)
* NPM (v9+)
* Git

### 2. Installation
Clone the codebase and load dependencies:
```bash
git clone https://github.com/your-username/intellectual-collective.git
cd intellectual-collective
npm install
```

### 3. Configuration
Duplicate the example environment file and insert your development keys:
```bash
cp .env.example .env
```
*(See External Service Setup Guide below if you need to generate these keys)*

### 4. Running the App
Initiate the concurrent frontend and backend dev servers:
```bash
npm run dev
```
The application will launch on port `3000` (or your configured port).

---

##  Deployment (Render.com)

This application is strictly optimized for PaaS deployments like **Render**.

1. Create a New **Web Service** on Render.
2. Link your GitHub repository.
3. Configure the application layer:
   * **Language / Environment:** `Node`
   * **Build Command:** `$ npm install; npm run build`
   * **Start Command:** `$ npm run start`
4. Expand **Environment Variables** and securely map every key from your `.env` file into Render's vault.
5. Click **Deploy**.

---

##  External Service Setup Guide

### MongoDB Atlas
1. Create a free cluster on [MongoDB Atlas](https://www.mongodb.com/cloud/atlas).
2. Go to **Database Access** and create a user with read/write privileges.
3. Go to **Network Access** and whitelist `0.0.0.0/0` (allow from anywhere) for hosting platforms.
4. Go to **Database**, click **Connect** -> **Drivers**, and copy the connection string into `MONGODB_URI`.

### Google Cloud Console (OAuth)
1. Go to [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new Project.
3. Navigate to **APIs & Services** > **Credentials**.
4. Configure the **OAuth Consent Screen**.
5. Create **OAuth Client ID** (Type: Web Application).
6. Under **Authorized JavaScript Origins**, add your primary URLs (e.g., `http://localhost:3000` and `https://your-custom-app.onrender.com`).
7. Copy the generated Client ID and Client Secret to your environment file.

### Cloudinary
1. Create a free account at [Cloudinary](https://cloudinary.com/).
2. Browse to your **Dashboard**.
3. Under **Product Environment Credentials**, copy the **API Environment variable** (`CLOUDINARY_URL`).

---

##  API Reference (Highlight)

A quick glimpse into the internal REST architecture managing the collective.

* **Authentication API**
  * `POST /api/auth/google` - Exchanges Google tokens for application session.
  * `GET /api/auth/me` - Resolves current user context via JWT validation.
  * `POST /api/auth/logout` - Terminates the active session.

* **Resource API**
  * `GET /api/resources` - Fetches paginated resources for the dashboard.
  * `POST /api/resources` - Uploads media to Cloudinary and registers resource data in Mongo.
  
* **Discussions & Networking API**
  * `GET /api/discussions` - Retrieves structured forum threads.
  * `POST /api/discussions` - Commits a new question/topic.
  * `GET /api/users/matches` - Returns a sorted array of peers overlapping defined academic interests.

---

##  Contributing

Contributions make the scholarly community better.
1. Fork the Project.
2. Create your Feature Branch (`git checkout -b feature/AmazingImplementation`).
3. Commit your Changes (`git commit -m 'Add some AmazingImplementation'`).
4. Push to the Branch (`git push origin feature/AmazingImplementation`).
5. Open a Pull Request.

---

##  License

Distributed under the MIT License. See `LICENSE` for more information.
