"""Keep the voice tools gentle on the machine they run on (the user's own PC, with other work going):
at most VOICE_THREADS CPU threads (2 unless set) and idle priority, so it only uses time nothing else
wants. Import it before torch: `import gentle` (it sets the thread variables torch reads)."""
import ctypes, os, sys

THREADS = int(os.environ.get('VOICE_THREADS', '2'))
for k in ('OMP_NUM_THREADS', 'MKL_NUM_THREADS', 'OPENBLAS_NUM_THREADS', 'NUMEXPR_NUM_THREADS'):
    os.environ[k] = str(THREADS)
if sys.platform == 'win32':
    IDLE = 0x40
    ctypes.windll.kernel32.SetPriorityClass(ctypes.windll.kernel32.GetCurrentProcess(), IDLE)
else:
    os.nice(19)


def torch_threads(torch):
    torch.set_num_threads(THREADS)
    torch.set_num_interop_threads(1)
