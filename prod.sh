#!/bin/bash
./kill.sh
docker run -d --name i3d-auto \
  --env-file .env \
  -v `pwd`:/app \
  -w /app \
  -e FORCE_COLOR=1 \
  -p 80 \
  node:6 bash -c 'npm install && npm run main serve'
./logs.sh
