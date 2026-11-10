# Build-context: de repo-root (de spec is de enige bron, geen kopie in mock/).
#   docker build -f mock/Dockerfile -t diftar-mock .

# Generator: maakt de expectations uit spec, templates en dataset. Ook los te draaien met --watch (zie compose.yaml).
FROM node:22-alpine AS generator
WORKDIR /build
RUN npm install --no-save js-yaml@4.1.0 ajv@8.17.1 ajv-formats@3.0.1
COPY mock/build-expectations.mjs ./
COPY mock/templates ./templates
COPY mock/dataset ./dataset
COPY diftar-openapi.yaml ./
RUN node build-expectations.mjs diftar-openapi.yaml templates dataset/dataset.json dataset/dataset.schema.json /out /config
CMD ["node", "build-expectations.mjs", "diftar-openapi.yaml", "templates", "/dataset/dataset.json", "/dataset/dataset.schema.json", "/generated", "/generated", "--watch"]

# MockServer-jars uit het officiële image (gepind). Dat image is gebouwd op Debian en bevat een volledige JRE;
# hieronder gebruiken we alleen de jars op een alpine-basis met een verkleinde Java-runtime.
FROM mockserver/mockserver:9.2.0-graaljs AS mockserver

# Verkleinde runtime: alleen de modules die de jars nodig hebben (bepaald met jdeps), plus enkele veiligheidsmarges.
FROM eclipse-temurin:25-jdk-alpine AS runtime
RUN jlink --add-modules java.base,java.compiler,java.desktop,java.logging,java.management,java.naming,java.net.http,java.prefs,java.scripting,java.security.jgss,java.security.sasl,java.sql,java.xml,java.xml.crypto,jdk.crypto.ec,jdk.dynalink,jdk.httpserver,jdk.internal.vm.ci,jdk.jfr,jdk.management,jdk.unsupported,jdk.zipfs \
      --strip-debug --no-man-pages --no-header-files --compress=zip-9 --output /runtime

FROM alpine:3.22
RUN adduser -D -u 10001 mock
COPY --from=runtime /runtime /opt/java
COPY --from=mockserver /mockserver.jar /mockserver-deps.jar /
COPY --from=mockserver /libs /libs
COPY --from=generator /out/ /config/
COPY diftar-openapi.yaml /config/diftar-openapi.yaml
# Modus none (standaard). Voor modus keycloak: MOCKSERVER_INITIALIZATION_JSON_PATH=/config/expectations-keycloak.json
ENV PATH=/opt/java/bin:$PATH \
    SERVER_PORT=1080 \
    MOCKSERVER_INITIALIZATION_JSON_PATH=/config/expectations-none.json \
    MOCKSERVER_LOG_LEVEL=INFO
USER mock
EXPOSE 1080
HEALTHCHECK --interval=10s --timeout=5s --start-period=30s CMD wget -q --spider http://localhost:1080/v1/openapi.json || exit 1
ENTRYPOINT ["java", "-Dfile.encoding=UTF-8", "--enable-native-access=ALL-UNNAMED", "-XX:MaxRAMPercentage=45.0", "-cp", "/mockserver.jar:/mockserver-deps.jar:/libs/*", "org.mockserver.cli.Main"]
