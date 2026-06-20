import re
from typing import Optional, List

# ── Python built-in standard-library modules (stdlib) ────────────────────────
# Used by extract_python_packages to skip non-pip imports.
PYTHON_STDLIB = {
    "abc", "ast", "asyncio", "base64", "binascii", "builtins", "cgi",
    "cgitb", "chunk", "cmath", "cmd", "code", "codecs", "codeop",
    "collections", "colorsys", "compileall", "concurrent", "configparser",
    "contextlib", "contextvars", "copy", "copyreg", "csv", "ctypes",
    "curses", "dataclasses", "datetime", "dbm", "decimal", "difflib",
    "dis", "doctest", "email", "encodings", "enum", "errno", "faulthandler",
    "fcntl", "filecmp", "fileinput", "fnmatch", "fractions", "ftplib",
    "functools", "gc", "getopt", "getpass", "gettext", "glob", "grp",
    "gzip", "hashlib", "heapq", "hmac", "html", "http", "idlelib",
    "imaplib", "importlib", "inspect", "io", "ipaddress", "itertools",
    "json", "keyword", "lib2to3", "linecache", "locale", "logging",
    "lzma", "mailbox", "marshal", "math", "mimetypes", "mmap", "modulefinder",
    "multiprocessing", "netrc", "nis", "nntplib", "numbers", "operator",
    "optparse", "os", "ossaudiodev", "pathlib", "pdb", "pickle",
    "pickletools", "pipes", "pkgutil", "platform", "plistlib", "poplib",
    "posix", "posixpath", "pprint", "profile", "pstats", "pty", "pwd",
    "py_compile", "pyclbr", "pydoc", "queue", "quopri", "random", "re",
    "readline", "reprlib", "resource", "rlcompleter", "runpy", "sched",
    "secrets", "select", "selectors", "shelve", "shlex", "shutil", "signal",
    "site", "smtpd", "smtplib", "sndhdr", "socket", "socketserver",
    "spwd", "sqlite3", "sre_compile", "sre_constants", "sre_parse",
    "ssl", "stat", "statistics", "string", "stringprep", "struct",
    "subprocess", "sunau", "symtable", "sys", "sysconfig", "syslog",
    "tabnanny", "tarfile", "telnetlib", "tempfile", "termios", "test",
    "textwrap", "threading", "time", "timeit", "tkinter", "token",
    "tokenize", "tomllib", "trace", "traceback", "tracemalloc", "tty",
    "turtle", "turtledemo", "types", "typing", "unicodedata", "unittest",
    "urllib", "uu", "uuid", "venv", "warnings", "wave", "weakref",
    "webbrowser", "wsgiref", "xdrlib", "xml", "xmlrpc", "zipapp",
    "zipfile", "zipimport", "zlib", "zoneinfo",
}

LANGUAGE_CONFIG = {
    "javascript": {"suffix": ".js",  "cmd": "node"},
    "js":         {"suffix": ".js",  "cmd": "node"},
    "python":     {"suffix": ".py",  "cmd": "python3"},
    "py":         {"suffix": ".py",  "cmd": "python3"},
}

def get_base_package_name(import_path: str) -> Optional[str]:
    """
    Given an import path (e.g. 'express', 'lodash/chunk', '@nestjs/core/subpath'),
    returns the base package name (e.g. 'express', 'lodash', '@nestjs/core') if it is an npm package,
    or None if it is a built-in module, a relative path, or invalid.
    """
    import_path = import_path.strip()
    if not import_path:
        return None
        
    # Ignore relative / absolute import paths
    if import_path.startswith('.') or import_path.startswith('/'):
        return None
        
    # Ignore node: prefix (standard Node built-in scheme)
    if import_path.startswith('node:'):
        return None
        
    # Node.js standard built-in modules list
    built_ins = {
        "assert", "async_hooks", "buffer", "child_process", "cluster", "console",
        "constants", "crypto", "dgram", "diagnostics_channel", "dns", "domain",
        "events", "fs", "http", "http2", "https", "inspector", "module", "net",
        "os", "path", "perf_hooks", "process", "punycode", "querystring", "readline",
        "repl", "stream", "string_decoder", "sys", "timers", "tls", "trace_events",
        "tty", "url", "util", "v8", "vm", "wasi", "worker_threads", "zlib"
    }
    
    parts = import_path.split('/')
    if import_path.startswith('@'):
        # Scoped package: e.g. @nestjs/core/subpath -> @nestjs/core
        if len(parts) >= 2:
            base_pkg = f"{parts[0]}/{parts[1]}"
        else:
            base_pkg = import_path
    else:
        # Regular package: e.g. lodash/chunk -> lodash
        base_pkg = parts[0]
        
    if base_pkg in built_ins:
        return None
        
    return base_pkg


def extract_npm_packages(code: str) -> List[str]:
    """
    Parses JavaScript/TypeScript code to extract all imported npm package names.
    Ignores relative paths and Node.js built-in modules.
    """
    packages = set()
    
    # Pattern for ESM imports:
    esm_pattern = re.compile(
        r'(?:^|\s)import\s+(?:[^;\'"]+\s+from\s+)?[\'"]([^\'"]+)[\'"]',
        re.MULTILINE
    )
    
    # Pattern for CommonJS require:
    cjs_pattern = re.compile(
        r'(?:^|\s)require\s*\(\s*[\'"]([^\'"]+)[\'"]\s*\)',
        re.MULTILINE
    )
    
    # Pattern for dynamic imports:
    dyn_pattern = re.compile(
        r'(?:^|\s)import\s*\(\s*[\'"]([^\'"]+)[\'"]\s*\)',
        re.MULTILINE
    )
    
    for pattern in (esm_pattern, cjs_pattern, dyn_pattern):
        for match in pattern.finditer(code):
            pkg_path = match.group(1)
            base_pkg = get_base_package_name(pkg_path)
            if base_pkg:
                packages.add(base_pkg)
                
    return sorted(list(packages))


def extract_python_packages(code: str) -> List[str]:
    """
    Parses Python code to extract third-party pip package names.
    Ignores stdlib modules and relative imports.
    """
    packages = set()

    # Match: import X, from X import Y
    import_pattern = re.compile(
        r'^\s*(?:import|from)\s+([a-zA-Z_][a-zA-Z0-9_]*)',
        re.MULTILINE
    )

    for match in import_pattern.finditer(code):
        mod = match.group(1).strip()
        if mod and mod not in PYTHON_STDLIB:
            # Map common import names to pip package names
            pip_name = _IMPORT_TO_PIP.get(mod, mod)
            packages.add(pip_name)

    return sorted(list(packages))


# Some packages have different import names vs pip install names
_IMPORT_TO_PIP: dict = {
    "cv2":         "opencv-python",
    "PIL":         "Pillow",
    "sklearn":     "scikit-learn",
    "bs4":         "beautifulsoup4",
    "yaml":        "PyYAML",
    "dotenv":      "python-dotenv",
    "dateutil":    "python-dateutil",
    "boto3":       "boto3",
    "botocore":    "botocore",
    "Crypto":      "pycryptodome",
    "jwt":         "PyJWT",
    "psycopg2":    "psycopg2-binary",
    "MySQLdb":     "mysqlclient",
    "tensorflow":  "tensorflow",
    "torch":       "torch",
    "np":          "numpy",   # uncommon but handle alias
    "pd":          "pandas",
}


def execute_in_sandbox(code: str, language: str = "javascript", timeout: int = 60) -> dict:
    """
    Docker-backed replacement for E2B sandbox execution.
    Delegates to docker_tool.run_code_in_container.
    Signature preserved for backward compatibility with graph/nodes.py.
    """
    from tools.docker_tool import run_code_in_container
    return run_code_in_container(code, language, timeout)


def execute_nodejs_in_sandbox(code: str) -> dict:
    """Convenience wrapper — kept for backward compatibility with older test scripts."""
    return execute_in_sandbox(code, language="javascript")
