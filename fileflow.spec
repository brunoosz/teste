# -*- mode: python ; coding: utf-8 -*-

import os
from PyInstaller.utils.hooks import collect_data_files, collect_submodules

block_cipher = None

rembg_datas = collect_data_files("rembg")
onnxruntime_datas = collect_data_files("onnxruntime")

a = Analysis(
    ["app.py"],
    pathex=[],
    binaries=[],
    datas=[
        ("templates", "templates"),
    ]
    + rembg_datas
    + onnxruntime_datas,
    hiddenimports=[
        "rembg",
        "rembg.sessions",
        "rembg.sessions.u2net",
        "onnxruntime",
        "PIL",
        "pdf2docx",
        "docx",
        "openpyxl",
        "fpdf",
        "fpdf.enums",
    ]
    + collect_submodules("rembg")
    + collect_submodules("onnxruntime"),
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name="FileFlow",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,
    icon=None,
)
