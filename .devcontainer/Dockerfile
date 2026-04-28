# # Initial image
# FROM node:22.2.0-alpine3.20

# # Install Git
# RUN apk fix && apk --no-cache --update add git curl libx11 nss gtk+3.0

# use the version that corresponds to your electron version
FROM node:22

# install electron dependencies, sudo, wine, and other tools
RUN apt-get update && export DEBIAN_FRONTEND=noninteractive && \
    # Add wine repository
    apt-get install -yq --no-install-recommends wget gnupg2 && \
    wget -nc https://dl.winehq.org/wine-builds/winehq.key && \
    apt-key add winehq.key && \
    echo "deb https://dl.winehq.org/wine-builds/ubuntu/ focal main" >> /etc/apt/sources.list && \
    # Enable i386 architecture for wine
    dpkg --add-architecture i386 && \
    apt-get update && \
    # Install all packages
    apt-get install -yq --no-install-suggests --no-install-recommends \
    git libx11-xcb1 libxcb-dri3-0 libxtst6 libnss3 libatk-bridge2.0-0 libgtk-3-0 \
    libxss1 libasound2 xorg openbox libatk-adaptor dbus xvfb gtk2-engines-pixbuf \
        sudo docker.io winehq-stable && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Install Docker Compose v2 plugin for `docker compose` compatibility.
ARG DOCKER_COMPOSE_VERSION=v2.33.1
RUN set -eux; \
        arch="$(dpkg --print-architecture)"; \
        case "$arch" in \
            amd64) compose_arch='x86_64' ;; \
            arm64) compose_arch='aarch64' ;; \
            *) echo "Unsupported architecture for Docker Compose plugin: $arch"; exit 1 ;; \
        esac; \
        sudo mkdir -p /usr/local/lib/docker/cli-plugins; \
        sudo wget -O /usr/local/lib/docker/cli-plugins/docker-compose \
            "https://github.com/docker/compose/releases/download/${DOCKER_COMPOSE_VERSION}/docker-compose-linux-${compose_arch}"; \
        sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-compose

RUN dbus-uuidgen > /var/lib/dbus/machine-id

RUN mkdir -p /var/run/dbus

RUN dbus-daemon --config-file=/usr/share/dbus-1/system.conf --print-address

# Create/configure vscode user with UID/GID 1000
RUN if id -u 1000 >/dev/null 2>&1; then \
        # User with UID 1000 exists, modify it to be vscode \
        existing_user=$(id -nu 1000); \
        if [ "$existing_user" != "vscode" ]; then \
            usermod -l vscode -d /home/vscode -m $existing_user; \
        fi; \
    else \
        # Create new user \
        useradd -m -s /bin/bash -u 1000 -g $(id -g 1000 2>/dev/null || echo "1000") vscode; \
    fi && \
    # Ensure group exists and is named vscode \
    if getent group 1000 >/dev/null 2>&1; then \
        group_name=$(getent group 1000 | cut -d: -f1); \
        if [ "$group_name" != "vscode" ]; then \
            groupmod -n vscode $group_name; \
        fi; \
    else \
        groupadd -g 1000 vscode; \
    fi && \
    # Add to sudoers and setup workspace \
    echo "vscode ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers && \
    mkdir -p /workspace && \
    chown -R vscode:vscode /workspace

# Switch to the vscode user
USER vscode

# Set working directory
WORKDIR /workspace

# Initialise wine for the user and create entrypoint
RUN wine --version && \
    echo '#!/bin/bash' > /home/vscode/entrypoint.sh && \
    echo '' >> /home/vscode/entrypoint.sh && \
    echo '# Fix workspace permissions' >> /home/vscode/entrypoint.sh && \
    echo 'sudo chown -R vscode:vscode /workspace 2>/dev/null || true' >> /home/vscode/entrypoint.sh && \
    echo '' >> /home/vscode/entrypoint.sh && \
    echo '# Grant vscode access to mounted host docker socket when available' >> /home/vscode/entrypoint.sh && \
    echo 'if [ -S /var/run/docker.sock ]; then' >> /home/vscode/entrypoint.sh && \
    echo '  sock_gid=$(stat -c "%g" /var/run/docker.sock)' >> /home/vscode/entrypoint.sh && \
    echo '  if [ -n "$sock_gid" ] && [ "$sock_gid" = "0" ]; then' >> /home/vscode/entrypoint.sh && \
    echo '    sudo chmod 666 /var/run/docker.sock 2>/dev/null || true' >> /home/vscode/entrypoint.sh && \
    echo '  elif [ -n "$sock_gid" ]; then' >> /home/vscode/entrypoint.sh && \
    echo '    if ! getent group "$sock_gid" >/dev/null 2>&1; then' >> /home/vscode/entrypoint.sh && \
    echo '      sudo groupadd -g "$sock_gid" docker-host 2>/dev/null || true' >> /home/vscode/entrypoint.sh && \
    echo '    fi' >> /home/vscode/entrypoint.sh && \
    echo '    sock_group=$(getent group "$sock_gid" | cut -d: -f1)' >> /home/vscode/entrypoint.sh && \
    echo '    if [ -n "$sock_group" ] && ! id -nG "$USER" | tr " " "\n" | grep -qx "$sock_group"; then' >> /home/vscode/entrypoint.sh && \
    echo '      sudo usermod -aG "$sock_group" "$USER" || true' >> /home/vscode/entrypoint.sh && \
    echo '    fi' >> /home/vscode/entrypoint.sh && \
    echo '  fi' >> /home/vscode/entrypoint.sh && \
    echo 'fi' >> /home/vscode/entrypoint.sh && \
    echo '' >> /home/vscode/entrypoint.sh && \
    echo '# Set up Wine environment' >> /home/vscode/entrypoint.sh && \
    echo 'export WINEARCH=win64' >> /home/vscode/entrypoint.sh && \
    echo 'export WINEPREFIX=/home/vscode/.wine' >> /home/vscode/entrypoint.sh && \
    echo '' >> /home/vscode/entrypoint.sh && \
    echo '# Initialise Wine if needed' >> /home/vscode/entrypoint.sh && \
    echo 'if [ ! -d "$WINEPREFIX" ]; then' >> /home/vscode/entrypoint.sh && \
    echo '  echo "Initializing Wine..."' >> /home/vscode/entrypoint.sh && \
    echo '  wineboot --init &>/dev/null' >> /home/vscode/entrypoint.sh && \
    echo 'fi' >> /home/vscode/entrypoint.sh && \
    echo '' >> /home/vscode/entrypoint.sh && \
    echo '# Execute the command' >> /home/vscode/entrypoint.sh && \
    echo 'exec "$@"' >> /home/vscode/entrypoint.sh && \
    chmod +x /home/vscode/entrypoint.sh

# Set proper umask for file creation
RUN echo "umask 0002" >> ~/.bashrc

# Set environment variables for Wine
ENV WINEARCH=win64
ENV WINEPREFIX=/home/vscode/.wine

# Default development environment variables (can be overridden by compose)
ENV POSTGRES_USER=postgres
# POSTGRES_PASSWORD should be provided by developer via devcontainer.containerEnv or local env
ENV POSTGRES_DB=postgres
ENV POSTGRES_HOST=localhost
ENV POSTGRES_PORT_INT=5432
# POSTGRES_URL_NO_SSL can be provided via devcontainer.containerEnv or local environment
ENV POSTGRES_URL_NO_SSL=
ENV ENV=dev
ENV DISPLAY=:99

# Declare writable mount points for workspace and copilot chat sessions
# VOLUME ["/workspace", "/workspace/.copilot-chats"]
VOLUME ["/workspace"]

# Use the entrypoint script
ENTRYPOINT ["/home/vscode/entrypoint.sh"]
# Default command for development containers (keeps container alive)
CMD ["sleep", "infinity"]
