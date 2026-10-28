#!/usr/bin/env python3
"""Capture a source-renderer preview of Tiltburst's committed Neon Drift art.

Requires sibling Tiltburst's CMake Debug target already built. Original source and
archives remain unchanged. This is a table-art preview, not a gameplay screenshot.
Only a temporary copy of src/render/sdf_batch.cpp is adapted: device-supported
shader selection, the committed MSL main0 entrypoint, CPU-to-shader instance ABI,
and an upload command outside the render pass. Authored table art, ArtRenderer,
and GPU shaders are unchanged. The standalone harness owns offscreen targets,
submission/readback, and table-meter transforms; it does not run the app's broken
legacy render-smoke path or create gameplay screens.

macOS setup (Apple Command Line Tools, CMake 3.28+ and Ninja required):
  git clone https://github.com/L-K-M/Tiltburst.git ../Tiltburst
  git -C ../Tiltburst checkout aebd31eeed0b363e7b11abac1eb63754d04a02e8
  git clone https://github.com/microsoft/vcpkg /absolute/path/vcpkg
  git -C /absolute/path/vcpkg checkout 00c5775211f45cd08b37fce0484b4cb940e422ab
  /absolute/path/vcpkg/bootstrap-vcpkg.sh -disableMetrics
  export VCPKG_ROOT=/absolute/path/vcpkg
  cd ../Tiltburst
  cmake --preset debug -DTB_COMPILE_SHADERS=OFF
  cmake --build --preset debug --target tiltburst
  cd ../apps-site
  python3 scripts/screenshots/privacy/capture-tiltburst.py

If Ninja is outside PATH, set NINJA_BIN to its executable. Temporary compiler/link
commands reuse compile_commands.json and Ninja's exact target link command.
"""
from pathlib import Path
import json
import os
import shlex
import shutil
import subprocess
import tempfile

HERE = Path(__file__).resolve().parent
SITE = HERE.parents[2]
REPO = SITE.parent / 'Tiltburst'
BUILD = REPO / 'build/debug'
NINJA = os.environ.get('NINJA_BIN') or shutil.which('ninja')
if not NINJA or not shutil.which(NINJA):
    raise SystemExit('Ninja is required. Install Ninja on PATH or set NINJA_BIN to its executable.')
commands = json.loads((BUILD / 'compile_commands.json').read_text())
with tempfile.TemporaryDirectory(prefix='cabinet-tiltburst-') as scratch_name:
    scratch = Path(scratch_name)
    archive = scratch / 'libtb_render.a'
    shutil.copyfile(BUILD / 'src/render/libtb_render.a', archive)
    original = REPO / 'src/render/sdf_batch.cpp'
    text = original.read_text()
    # Select the device-supported existing format and its actual MSL entrypoint.
    text = text.replace('for (const Fmt& f : fmts) {',
        'for (const Fmt& f : fmts) {\n        if (!(SDL_GetGPUShaderFormats(dev) & f.format)) continue;')
    text = text.replace('ci.entrypoint = "main";',
        'ci.entrypoint = f.format == SDL_GPU_SHADERFORMAT_MSL ? "main0" : "main";')
    # The source instance stores kind as uint32_t, while the committed shader
    # consumes a numeric float. Shape parameters also differ between the CPU
    # and shader schemas; adapt those fields at this upload boundary.
    text = text.replace('SDL_UnmapGPUTransferBuffer(device_, upload_);', '''
    for (size_t i = 0; i < pending_.size(); ++i) {
        auto* row = static_cast<float*>(map) + i * (sizeof(SdfInstance) / sizeof(float));
        const auto& instance = pending_[i];
        row[5] = float(instance.kind);
        // Adapt the source CPU instance schema to the committed shader schema.
        if (instance.kind == kSdfRbox) {
            row[6] = instance.hx; row[7] = instance.hy; row[8] = instance.p0;
        } else if (instance.kind == kSdfCapsule) {
            const float half_length = std::max(0.0f, instance.hx - instance.p0);
            row[6] = -half_length; row[7] = 0; row[8] = half_length;
            row[9] = 0; row[10] = instance.p0;
        } else if (instance.kind == kSdfArc) {
            row[6] = instance.p2; row[7] = instance.p3;
            row[8] = instance.p0; row[9] = instance.p1;
        }
    }
    SDL_UnmapGPUTransferBuffer(device_, upload_);''')
    # Metal cannot open a copy encoder while the same command has an active
    # render encoder. Submit the upload on a separate command before drawing.
    text = text.replace('SDL_GPUCopyPass* copy = SDL_BeginGPUCopyPass(cmd_);',
        'SDL_GPUCommandBuffer* upload_command = SDL_AcquireGPUCommandBuffer(device_);\n    SDL_GPUCopyPass* copy = SDL_BeginGPUCopyPass(upload_command);')
    text = text.replace('SDL_EndGPUCopyPass(copy);\n\n    SDL_BindGPUGraphicsPipeline',
        'SDL_EndGPUCopyPass(copy);\n    SDL_SubmitGPUCommandBuffer(upload_command);\n\n    SDL_BindGPUGraphicsPipeline')
    patched = scratch / 'sdf_batch.cpp'
    patched.write_text(text)
    entry = next(c for c in commands if c['file'] == str(original))
    command = shlex.split(entry['command'])
    command[command.index('-o') + 1] = str(scratch / 'sdf_batch.cpp.o')
    command[command.index(str(original))] = str(patched)
    subprocess.run(command, cwd=BUILD, check=True)
    subprocess.run(['/usr/bin/ar', 'r', str(archive), str(scratch / 'sdf_batch.cpp.o')], check=True)
    entry = next(c for c in commands if c['file'] == str(REPO / 'src/main.cpp'))
    command = shlex.split(entry['command'])
    command[command.index('-o') + 1] = str(scratch / 'capture.o')
    command[command.index(str(REPO / 'src/main.cpp'))] = str(HERE / 'tiltburst.cpp')
    subprocess.run(command, cwd=BUILD, check=True)
    command_list = subprocess.check_output([NINJA, '-C', str(BUILD), '-t', 'commands', 'tiltburst'], text=True)
    link = shlex.split(command_list.splitlines()[-1].replace(': && ', '').removesuffix(' && :'))
    link[link.index('-o') + 1] = str(scratch / 'capture')
    link[link.index('src/render/libtb_render.a')] = str(archive)
    link[link.index('CMakeFiles/tiltburst.dir/src/main.cpp.o')] = str(scratch / 'capture.o')
    link.remove('CMakeFiles/tiltburst.dir/src/platform/app.cpp.o')
    subprocess.run(link, cwd=BUILD, check=True)
    env = dict(os.environ, SDL_VIDEODRIVER='cocoa')
    env.pop('SDL_ASSERT', None)  # A successful capture must not suppress assertions.
    subprocess.run([str(scratch / 'capture'), str(REPO / 'tables/neon-drift'),
        str(BUILD / 'bin/shaders'), str(SITE / 'catalogue/assets/tiltburst.png')], env=env, check=True)
