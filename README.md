# Task Management

## Prerequisites

Install the following tools before setting up the project:

- [Node.js](https://nodejs.org/) with npm
- [Python](https://www.python.org/) 3.10 or newer

## Install Dependencies

The frontend and backend are separate projects, so install their dependencies independently.

### Frontend

From the repository root, run:

```powershell
cd frontend
npm run dev
```

### Backend

From the repository root, create a virtual environment and install the Python dependencies:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python -m pip install python-multipart
```

The backend requires a `backend/.env` file with these values:

```dotenv
DATABASE_URL=your_database_connection_url
SECRET_KEY=your_jwt_secret_key
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30
```

`ACCESS_TOKEN_EXPIRE_MINUTES` is optional and defaults to `30`.

## Start the Frontend

Open a terminal at the repository root and run:

```powershell
cd frontend
npm run dev
```

Vite prints the local frontend URL in the terminal, typically `http://localhost:5173`.

## Start the Backend

Open a second terminal at the repository root and run:

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
python -m uvicorn src.main:app --reload
```

The API is available at `http://localhost:8000`, with interactive documentation at `http://localhost:8000/docs`.
