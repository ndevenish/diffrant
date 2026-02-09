#!/usr/bin/env -S uv run --script --no-project
# /// script
# dependencies = [
#   "h5py",
#   "imageio",
#   "hdf5plugin",
#   "pillow",
#   "numpy",
# ]
# ///

import h5py
import imageio.v3 as iio
from pathlib import Path
import sys
import hdf5plugin
import numpy as np
from PIL import Image

h5_path = sys.argv[1]
png_path = Path("test.png")

with h5py.File(h5_path, "r") as f:
    ds = f["/entry/data/data_000001"]
    original = ds[0]
    chunk_size = ds.id.get_chunk_info(0).size
    # Write lossless PNG (max compression)
    iio.imwrite(png_path, original, compression=9)
    size_chunk = chunk_size / 1e6
    size_mb = png_path.stat().st_size / 1e6
    print(f"PNG size:   {size_mb:.2f} MB")
    print(f"BSLZ4 size: {size_chunk:.2f} MB")

    # Write a webp
    img8 = (original / 6 * 255).astype(np.uint8)
    im = Image.fromarray(img8, mode="L")
    im.save("test.webp", lossless=True, quality=100, method=6)

    # re-read to test
    roundtrip = iio.imread("test.png")
    print(roundtrip.dtype, roundtrip.shape)
    if original.shape != roundtrip.shape:
        raise ValueError("Shape mismatch")

    if original.dtype != roundtrip.dtype:
        raise ValueError("Dtype mismatch")

    diff = original.astype(np.int64) - roundtrip.astype(np.int64)

    print("Max abs diff:", np.max(np.abs(diff)))
    print("Nonzero pixels:", np.count_nonzero(diff))
