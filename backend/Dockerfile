FROM python:3.12-slim

WORKDIR /app

# System deps kept minimal: numpy/pandas wheels cover the math stack.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Application code + committed data artifacts.
COPY . .

EXPOSE 8000
CMD ["python", "-m", "uvicorn", "api:app", "--host", "0.0.0.0", "--port", "8000"]
