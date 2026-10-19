#!/bin/bash
echo "========================================"
echo "  FileFlow - Build"
echo "========================================"
echo

echo "[1/3] Instalando dependencias..."
pip install -r requirements.txt
pip install pyinstaller

echo
echo "[2/3] Gerando executavel..."
pyinstaller fileflow.spec --noconfirm

echo
echo "[3/3] Pronto!"
echo
echo "O executavel esta em: dist/FileFlow"
