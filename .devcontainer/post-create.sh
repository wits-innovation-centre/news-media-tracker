#!/bin/sh

corepack enable
corepack prepare pnpm@11.10.0 --activate

pnpm install
