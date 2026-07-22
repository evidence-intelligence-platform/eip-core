# EIP Core Repository (`eip-core`)

This repository contains the full platform implementation for the **Evidence Intelligence Platform (EIP)**, comprising the Isolated Intelligence Zone AI Engine and the Next.js Web Frontend.

---

## 🏗️ Repository Architecture

```
eip-core/
├── ai-engine/      # Python 3.11 / FastAPI — Isolated Intelligence Zone
└── frontend/       # Next.js 15 / TypeScript — Public Web Interface
```

### 1. AI Engine (`/ai-engine`)
- **Framework:** FastAPI + SQLModel + Google GenAI SDK
- **Port:** `8080`
- **Docs:** `http://localhost:8080/docs`
- **Key Responsibilities:** Deterministic evidence extraction, PDF parsing, Zero Trust API authentication, SQL persistence.

### 2. Frontend (`/frontend`)
- **Framework:** Next.js (App Router) + Tailwind CSS + TypeScript
- **Port:** `3000`
- **Key Views:**
  - Employer Dashboard (`/employer/dashboard`)
  - Candidate Evidence Hub (`/candidate/hub`)
  - Candidates Directory (`/candidates`)
  - Candidate Detail View (`/candidates/[id]`)
  - Explainability Report View (`/reports/[id]`)
  - Requirements Directory (`/requirements`)

---

## ⚡ Quick Start

### 1. Run AI Engine
```bash
cd ai-engine
python -m venv venv
venv\Scripts\activate       # Windows
source venv/bin/activate    # Linux/macOS
pip install -r requirements.txt
cp .env.example .env
uvicorn src.main:app --reload --port 8080
```

### 2. Run Frontend
```bash
cd frontend
npm install
npm run dev
```

---

## 🧪 Running Tests

```bash
cd ai-engine
venv\Scripts\python.exe -m pytest tests/ -v
```

---

## 🔒 Governance & Security Compliance
Refer to the `eif-core-docs` repository for constitutional rules (`01_ENGINEERING_CONSTITUTION.md`), database schemas (`05_DATABASE_SCHEMA.md`), and security architecture (`08_SECURITY_ARCHITECTURE.md`).
