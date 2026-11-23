FROM python:3.11-slim
WORKDIR /opt/handspeak
COPY app ./app
COPY start.py ./start.py
RUN useradd --uid 10001 --create-home handspeak && mkdir /data && chown handspeak:handspeak /data
USER handspeak
ENV HOST=0.0.0.0 PORT=8000 HANDSPEAK_DATA_DIR=/data PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
EXPOSE 8000
CMD ["python", "start.py"]
