#!/bin/sh

corepack enable
corepack prepare pnpm@11 --activate

pnpm install
