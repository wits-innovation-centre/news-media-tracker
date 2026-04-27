#!/bin/sh

set -eu

# npm run workspace.app.install

if [ -z "${SSH_AUTH_SOCK:-}" ]; then
	echo "SSH_AUTH_SOCK is not set. Configure agent forwarding in the devcontainer setup."
	exit 0
fi

if [ ! -S "${SSH_AUTH_SOCK}" ]; then
	echo "SSH_AUTH_SOCK is set to ${SSH_AUTH_SOCK}, but no socket exists there."
	exit 0
fi

# ssh-add -l returns:
# 0: agent reachable and has identities
# 1: agent reachable but no identities
# 2: agent unreachable
if ssh-add -l >/dev/null 2>&1; then
	echo "SSH agent forwarding is active and identities are available."
	if ! ssh -T -o BatchMode=yes -o StrictHostKeyChecking=accept-new git@github.com >/dev/null 2>&1; then
		echo "SSH agent is available; GitHub auth test returned non-zero (often normal without TTY)."
	fi
else
	status="$?"
	if [ "${status}" -eq 1 ]; then
		echo "SSH agent forwarding is active, but no identities are loaded on the host agent."
		echo "Run ssh-add on the host, then rebuild/reopen the devcontainer."
	else
		echo "SSH agent socket exists, but the agent is not reachable."
	fi
fi
