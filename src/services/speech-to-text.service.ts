import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import ffmpeg from "fluent-ffmpeg";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";

const execFileAsync = promisify(execFile);

interface TranscriptionResult {
  ok: boolean;
  text: string;
  raw?: any;
  error?: string | null;
}

class SpeechToTextService {
  private tempDir = path.resolve(process.cwd(), "temp", "audio");
  private scriptPath = path.resolve(process.cwd(), "scripts", "transcribe_audio.py");

  constructor() {
    fs.mkdirSync(this.tempDir, { recursive: true });
    this.configureFfmpeg();
  }

  public async transcribeFromBuffer(
    audioBuffer: Buffer,
    extension = "ogg"
  ): Promise<TranscriptionResult> {
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const inputPath = path.join(this.tempDir, `${unique}.${extension}`);
    const wavPath = path.join(this.tempDir, `${unique}.wav`);

    try {
      fs.writeFileSync(inputPath, audioBuffer);

      await this.convertToWav16kMono(inputPath, wavPath);

      const pythonCommand = process.env.STT_PYTHON_PATH || "py";
      const pythonArgs = process.env.STT_PYTHON_PATH
        ? [this.scriptPath, wavPath]
        : ["-3.12", this.scriptPath, wavPath];

      const { stdout, stderr } = await execFileAsync(pythonCommand, pythonArgs, {
        windowsHide: true,
        maxBuffer: 10 * 1024 * 1024,
        encoding: "utf8",
        env: {
          ...process.env,
          PYTHONIOENCODING: "utf-8",
          PYTHONUTF8: "1",
        },
      });

      if (stderr && stderr.trim()) {
        console.warn("STT stderr:", stderr);
      }

      const parsed = JSON.parse(stdout || "{}");
      const text = String(parsed?.text || "").trim();

      if (!text) {
        return {
          ok: false,
          text: "",
          raw: parsed,
          error: "A transcrição retornou vazia.",
        };
      }

      return {
        ok: true,
        text,
        raw: parsed,
      };
    } catch (error: any) {
      return {
        ok: false,
        text: "",
        error: error?.message || "Falha ao transcrever áudio.",
      };
    } finally {
      this.safeDelete(inputPath);
      this.safeDelete(wavPath);
    }
  }

  private configureFfmpeg(): void {
    const envPath = process.env.FFMPEG_PATH?.trim();

    if (envPath && fs.existsSync(envPath)) {
      ffmpeg.setFfmpegPath(envPath);
      console.log(`FFMPEG configurado via FFMPEG_PATH: ${envPath}`);
      return;
    }

    const installerPath = ffmpegInstaller?.path;

    if (installerPath && fs.existsSync(installerPath)) {
      ffmpeg.setFfmpegPath(installerPath);
      console.log(`FFMPEG configurado via @ffmpeg-installer/ffmpeg: ${installerPath}`);
      return;
    }

    console.warn("FFMPEG não encontrado via instalador. Tentando usar ffmpeg do sistema.");
    ffmpeg.setFfmpegPath("ffmpeg");
  }

  private async convertToWav16kMono(inputPath: string, outputPath: string): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      ffmpeg(inputPath)
        .audioChannels(1)
        .audioFrequency(16000)
        .audioCodec("pcm_s16le")
        .format("wav")
        .on("start", (commandLine) => {
          console.log("FFMPEG comando:", commandLine);
        })
        .on("end", () => resolve())
        .on("error", (error) => {
          reject(new Error(`Falha ao converter áudio com FFmpeg: ${error.message}`));
        })
        .save(outputPath);
    });
  }

  private safeDelete(filePath: string): void {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch {
      // ignora erro de limpeza
    }
  }
}

export const speechToTextService = new SpeechToTextService();