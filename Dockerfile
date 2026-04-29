FROM node:20-slim AS frontend
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install
COPY . .
RUN npm run build

FROM python:3.11-slim
RUN apt-get update && apt-get install -y --no-install-recommends poppler-utils && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY backend_python/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY backend_python/ ./backend_python/
COPY --from=frontend /app/dist ./dist
ENV PORT=8001
EXPOSE 8001
CMD uvicorn backend_python.main:app --host 0.0.0.0 --port $PORT
