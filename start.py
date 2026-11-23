import os,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parent
DATA=Path(os.environ.get("HANDSPEAK_DATA_DIR",str(ROOT/"data"))).resolve()
DATA.mkdir(parents=True,exist_ok=True)
os.environ["HANDSPEAK_DATA_DIR"]=str(DATA)
sys.path.insert(0,str(ROOT/"app"))
from server import run
run(os.environ.get("HOST","127.0.0.1"),int(os.environ.get("PORT","8000")))
