#!/bin/bash
docker run -it --rm \
  --env-file .env \
  -v `pwd`:/app \
  -w /app \
  -e FORCE_COLOR=1 \
  -p 80 \
  node:6 bash
