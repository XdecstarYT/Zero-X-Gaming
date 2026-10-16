import io, urllib.request, re, os
BASE = "https://overturemaps-us-west-2.s3.amazonaws.com/"
class HttpFile(io.RawIOBase):
    def __init__(self, key, size):
        self.url = BASE + key; self.size = size; self.pos = 0; self.cache = {}
    def readable(self): return True
    def seekable(self): return True
    def tell(self): return self.pos
    def seek(self, off, whence=0):
        if whence == 0: self.pos = off
        elif whence == 1: self.pos += off
        else: self.pos = self.size + off
        return self.pos
    def read(self, n=-1):
        if n < 0: n = self.size - self.pos
        if n == 0: return b""
        end = min(self.size, self.pos + n) - 1
        req = urllib.request.Request(self.url, headers={"Range": f"bytes={self.pos}-{end}"})
        for attempt in range(5):
            try:
                with urllib.request.urlopen(req, timeout=120) as r: data = r.read(); break
            except Exception as e:
                if attempt == 4: raise
        self.pos += len(data)
        return data
    def readinto(self, b):
        d = self.read(len(b)); b[:len(d)] = d; return len(d)
def listing(prefix):
    out = []; token = None
    while True:
        u = BASE + "?list-type=2&prefix=" + prefix + ("&continuation-token=" + urllib.parse.quote(token) if token else "")
        x = urllib.request.urlopen(u, timeout=60).read().decode()
        for k, s in re.findall(r"<Key>([^<]*)</Key>.*?<Size>(\d+)</Size>", x): out.append((k, int(s)))
        m = re.search(r"<NextContinuationToken>([^<]*)</NextContinuationToken>", x)
        if not m: break
        token = m.group(1)
    return out
import urllib.parse
