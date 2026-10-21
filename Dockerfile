FROM python:3.12-alpine

WORKDIR /app

RUN pip install --no-cache-dir fastapi uvicorn

COPY app /app/app
COPY run.sh /app/run.sh

RUN chmod +x /app/run.sh

CMD ["/app/run.sh"]

