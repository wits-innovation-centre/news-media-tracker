#!/bin/sh

set -eu

echo "Superproject post-create hook complete."

if [ -n "${SSH_AUTH_SOCK:-}" ] && [ -S "${SSH_AUTH_SOCK}" ]; then
	if ssh-add -l >/dev/null 2>&1; then
		echo "SSH agent forwarding is active and identities are available."
	elif [ "$?" -eq 1 ]; then
		echo "SSH agent forwarding is active, but no identities are loaded on the host agent."
	else
		echo "SSH agent socket exists, but the agent is not reachable."
	fi
else
	echo "SSH agent forwarding not configured for this container."
fi
