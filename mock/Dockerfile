# Build-context: de repo-root (de spec is de enige bron, geen kopie in mock/).
#   docker build -f mock/Dockerfile -t diftar-mock .
FROM node:22-alpine AS expectations
WORKDIR /build
RUN npm install --no-save js-yaml@4.1.0
COPY mock/build-expectations.mjs ./
COPY mock/templates ./templates
COPY diftar-openapi.yaml ./
RUN node build-expectations.mjs diftar-openapi.yaml templates /out /config/diftar-openapi.yaml

FROM mockserver/mockserver:9.2.0-graaljs
COPY --from=expectations /out/ /config/
COPY diftar-openapi.yaml /config/diftar-openapi.yaml
# Modus none (standaard). Voor modus keycloak: MOCKSERVER_INITIALIZATION_JSON_PATH=/config/expectations-keycloak.json
ENV MOCKSERVER_INITIALIZATION_JSON_PATH=/config/expectations-none.json \
    MOCKSERVER_VALIDATE_REQUESTS_AGAINST_OPEN_API_SPEC=true \
    MOCKSERVER_LOG_LEVEL=INFO
EXPOSE 1080
