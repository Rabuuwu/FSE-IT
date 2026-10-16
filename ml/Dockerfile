FROM python:3.12-slim
WORKDIR /app
COPY ml/requirements.txt /app/ml/requirements.txt
RUN pip install --no-cache-dir -r ml/requirements.txt
COPY ml /app/ml
ENV PORT=8000
USER 10001
CMD ["sh", "-c", "exec uvicorn ml.app:app --host 0.0.0.0 --port ${PORT}"]
