FROM node:22-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
                        docker.io \
                        docker-compose \
                        ripgrep \
                        curl \
                        ca-certificates \
                        libicu-dev \
                        git \
    && rm -rf /var/lib/apt/lists/*

ENV DOTNET_CLI_TELEMETRY_OPTOUT=1 \
    DOTNET_SKIP_FIRST_TIME_EXPERIENCE=1 \
    DOTNET_NOLOGO=1 \
    NUGET_XMLDOC_MODE=skip \
    DOTNET_ROOT=/usr/share/dotnet \
    PATH="${PATH}:/usr/share/dotnet:/usr/share/dotnet/tools:/workspace/node_modules/.bin"

RUN curl -sSL https://dot.net/v1/dotnet-install.sh | bash /dev/stdin --channel 10.0 --install-dir /usr/share/dotnet \
    && ln -s /usr/share/dotnet/dotnet /usr/bin/dotnet

ENV PATH="${PATH}:/root/.dotnet/tools"

WORKDIR /workspace
