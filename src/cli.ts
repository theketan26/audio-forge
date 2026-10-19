import fs from 'node:fs';
import path from 'node:path';
import { Command } from 'commander';
import pc from 'picocolors';
import { ForgeConfigSchema, type ForgeConfig } from './types.js';
import { AudioForgeGenerator } from './generator.js';
import { VoiceManager, POPULAR_VOICES } from './voice-manager.js';

const program = new Command();

program
  .name('audio-forge')
  .description('High-performance Piper TTS CLI with multi-voice support and resource monitoring')
  .version('1.0.0');

/**
 * Helper to print a styled performance summary to the console
 */
function printPerformanceSummary(report: any): void {
  console.log('\n' + pc.bold(pc.cyan('⚡ Audio Generation Summary')));
  console.log(pc.gray('─'.repeat(50)));
  console.log(`${pc.bold('Status:')}             ${report.status === 'success' ? pc.green('✔ SUCCESS') : pc.red('✖ FAILED')}`);
  console.log(`${pc.bold('Voice:')}              ${pc.yellow(report.task.voice)}`);
  console.log(`${pc.bold('Output File:')}        ${pc.underline(report.task.output_file)}`);
  console.log(`${pc.bold('Input Length:')}       ${report.task.text_words} words (${report.task.text_characters} chars)`);
  console.log(`${pc.bold('Audio Duration:')}     ${pc.green(report.timing.audio_duration_seconds + ' s')}`);
  console.log(`${pc.bold('Synthesis Time:')}     ${report.timing.synthesis_ms} ms (Total: ${report.timing.total_elapsed_ms} ms)`);
  console.log(`${pc.bold('Real-Time Factor:')}   ${report.timing.real_time_factor_rtf < 1.0 ? pc.green(report.timing.real_time_factor_rtf + 'x (faster than real-time)') : pc.yellow(report.timing.real_time_factor_rtf + 'x')}`);

  console.log('\n' + pc.bold(pc.cyan('📊 Resource Consumption Report')));
  console.log(pc.gray('─'.repeat(50)));
  console.log(`${pc.bold('Peak CPU Usage:')}     ${report.resources.cpu.peak_percent}% (Avg: ${report.resources.cpu.avg_percent}%)`);
  console.log(`${pc.bold('Peak Memory (RSS):')}  ${report.resources.memory.peak_rss_mb} MB (Initial: ${report.resources.memory.initial_rss_mb} MB, Final: ${report.resources.memory.final_rss_mb} MB)`);
  console.log(`${pc.bold('Peak Memory (VMS):')}  ${report.resources.memory.peak_vms_mb} MB`);
  console.log(`${pc.bold('Output File Size:')}   ${(report.resources.io.output_bytes / 1024).toFixed(1)} KB (${report.resources.io.sample_rate} Hz, ${report.resources.io.samples} samples)`);
  console.log(pc.gray('─'.repeat(50)) + '\n');
}

// 1. GENERATE COMMAND (Driven by JSON config)
program
  .command('generate')
  .description('Generate speech audio using a JSON configuration file')
  .requiredOption('-c, --config <file>', 'Path to JSON configuration file')
  .option('-o, --output <file>', 'Override output WAV file destination')
  .option('-r, --report <file>', 'Override performance report JSON destination')
  .option('-v, --voice <name>', 'Override voice model name')
  .option('--no-cloud', 'Disable Supabase database and storage sync')
  .action(async options => {
    try {
      const configPath = path.resolve(options.config);
      if (!fs.existsSync(configPath)) {
        console.error(pc.red(`Error: Config file not found at ${configPath}`));
        process.exit(1);
      }

      console.log(pc.cyan(`Loading configuration from ${pc.bold(options.config)}...`));
      const raw = fs.readFileSync(configPath, 'utf8');
      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(raw);
      } catch (e) {
        console.error(pc.red(`Error: Invalid JSON syntax in ${options.config}`));
        process.exit(1);
      }

      // Validate schema
      const parseResult = ForgeConfigSchema.safeParse(parsedJson);
      if (!parseResult.success) {
        console.error(pc.red('\n✖ Configuration Validation Failed:'));
        parseResult.error.errors.forEach(err => {
          console.error(`  - ${pc.yellow(err.path.join('.'))}: ${err.message}`);
        });
        process.exit(1);
      }

      const config: ForgeConfig = parseResult.data;

      // Apply CLI overrides if specified
      if (options.output) config.output.path = options.output;
      if (options.report) config.monitor.report_path = options.report;
      if (options.voice) config.voice.name = options.voice;
      if (options.cloud === false) config.cloud.enabled = false;

      console.log(pc.blue('Starting audio synthesis engine and process monitor...'));
      const generator = new AudioForgeGenerator();
      const { report, outputPath, cloudResult } = await generator.generate(config);

      printPerformanceSummary(report);
      if (config.monitor.enabled) {
        console.log(pc.green(`✔ Performance report written to: ${pc.bold(config.monitor.report_path)}`));
      }
      console.log(pc.green(`✔ Audio generated successfully at: ${pc.bold(outputPath)}`));

      if (cloudResult?.dbRecordId) {
        console.log(pc.cyan(`🐘 Neon DB Record ID:    ${pc.bold(cloudResult.dbRecordId)}`));
      }
      if (cloudResult?.r2StorageUri) {
        console.log(pc.cyan(`🔒 R2 Private URI:       ${pc.bold(cloudResult.r2StorageUri)}`));
      }
      if (cloudResult?.r2SecureSignedUrl) {
        console.log(pc.cyan(`🔑 R2 Signed Access URL: ${pc.underline(cloudResult.r2SecureSignedUrl)}`));
      }
      if (cloudResult?.r2ReportSignedUrl) {
        console.log(pc.cyan(`🔑 R2 Report Signed URL: ${pc.underline(cloudResult.r2ReportSignedUrl)}`));
      }
      if (cloudResult?.messages && cloudResult.messages.length > 0) {
        cloudResult.messages.forEach(msg => {
          console.log(pc.dim(`ℹ  Cloud Sync: ${msg}`));
        });
      }
      console.log('');
    } catch (err: any) {
      console.error(pc.red(`\n✖ Generation Failed: ${err.message}`));
      if (err.report) {
        printPerformanceSummary(err.report);
      }
      process.exit(1);
    }
  });

// 2. QUICK SYNTHESIZE COMMAND
program
  .command('quick')
  .description('Quickly synthesize text directly from CLI arguments')
  .argument('<text>', 'Text to synthesize')
  .option('-v, --voice <name>', 'Voice model name', 'en_US-lessac-low')
  .option('-o, --output <file>', 'Output WAV file', './output/quick_speech.wav')
  .option('-r, --report <file>', 'Metrics report JSON file', './output/quick_metrics.json')
  .option('--speed <number>', 'Speech length scale (<1.0 is faster)', '1.0')
  .option('--speaker <number>', 'Speaker ID index', '0')
  .action(async (text, options) => {
    try {
      const config: ForgeConfig = {
        version: '1.0',
        input: { text },
        voice: {
          name: options.voice,
          speaker_id: parseInt(options.speaker, 10),
          features: {
            length_scale: parseFloat(options.speed),
            noise_scale: 0.667,
            noise_w: 0.8,
            sentence_silence: 0.2,
          },
        },
        piper_config: {
          auto_download_voice: true,
          use_cuda: false,
        },
        output: {
          path: options.output,
          format: 'wav',
        },
        monitor: {
          enabled: true,
          report_path: options.report,
          sample_interval_ms: 50,
        },
        cloud: {
          enabled: true,
          table_name: 'audio_generations',
          upload_audio: true,
          upload_report: true,
        },
      };

      console.log(pc.cyan(`Synthesizing: "${pc.italic(text)}"`));
      const generator = new AudioForgeGenerator();
      const { report, outputPath, cloudResult } = await generator.generate(config);

      printPerformanceSummary(report);
      console.log(pc.green(`✔ Output saved to ${outputPath}`));
      console.log(pc.green(`✔ Report saved to ${options.report}`));

      if (cloudResult?.dbRecordId) {
        console.log(pc.cyan(`🐘 Neon DB Record ID:    ${pc.bold(cloudResult.dbRecordId)}`));
      }
      if (cloudResult?.r2StorageUri) {
        console.log(pc.cyan(`🔒 R2 Private URI:       ${pc.bold(cloudResult.r2StorageUri)}`));
      }
      if (cloudResult?.r2SecureSignedUrl) {
        console.log(pc.cyan(`🔑 R2 Signed Access URL: ${pc.underline(cloudResult.r2SecureSignedUrl)}`));
      }
      if (cloudResult?.r2ReportSignedUrl) {
        console.log(pc.cyan(`🔑 R2 Report Signed URL: ${pc.underline(cloudResult.r2ReportSignedUrl)}`));
      }
      if (cloudResult?.messages && cloudResult.messages.length > 0) {
        cloudResult.messages.forEach(msg => {
          console.log(pc.dim(`ℹ  Cloud Sync: ${msg}`));
        });
      }
      console.log('');
    } catch (err: any) {
      console.error(pc.red(`\n✖ Quick Synthesize Failed: ${err.message}`));
      process.exit(1);
    }
  });

// 3. VOICES MANAGEMENT COMMANDS
const voicesCmd = program.command('voices').description('Manage and explore Piper voice models');

voicesCmd
  .command('list')
  .description('List available Piper voices in the catalog and check installation status')
  .action(() => {
    const vm = new VoiceManager();
    const list = vm.listVoices();

    console.log(pc.bold(pc.cyan('\n🎙️ Available Piper Voices Catalog')));
    console.log(pc.gray('─'.repeat(75)));
    list.forEach(v => {
      const status = v.installed ? pc.green('✔ Installed') : pc.gray('○ Cloud Available');
      const speakers = v.speakersCount > 1 ? ` (${v.speakersCount} speakers)` : '';
      console.log(`${pc.bold(v.name.padEnd(25))} [${v.gender}, ${v.quality}] ${status}${speakers}`);
      console.log(pc.gray(`   ${v.description}`));
    });
    console.log(pc.gray('─'.repeat(75)));
    console.log(pc.dim('Use "audio-forge voices download <name>" to pre-cache any voice.\n'));
  });

voicesCmd
  .command('download')
  .description('Download and cache a voice model from Hugging Face')
  .argument('<name>', 'Voice model name (e.g. en_US-lessac-medium, en_US-libritts-high)')
  .action(async name => {
    try {
      const vm = new VoiceManager();
      console.log(pc.cyan(`Starting download for voice: ${pc.bold(name)}...`));
      const res = await vm.downloadVoice(name);
      console.log(pc.green(`✔ Successfully downloaded and cached voice "${name}":`));
      console.log(`  Model:  ${res.modelPath}`);
      console.log(`  Config: ${res.configPath}\n`);
    } catch (err: any) {
      console.error(pc.red(`✖ Failed to download voice: ${err.message}`));
      process.exit(1);
    }
  });

voicesCmd
  .command('info')
  .description('Show detailed metadata and speakers for a voice model')
  .argument('<name>', 'Voice model name')
  .action(async name => {
    try {
      const vm = new VoiceManager();
      const resolved = await vm.resolveVoice(name, undefined, undefined, false);
      console.log(pc.bold(pc.cyan(`\nVoice Details: ${resolved.name}`)));
      console.log(`Model Path:   ${resolved.modelPath}`);
      console.log(`Config Path:  ${resolved.configPath}`);
      console.log(`Sample Rate:  ${resolved.sampleRate} Hz`);
      console.log(`Speakers:     ${resolved.numSpeakers}`);

      if (resolved.speakerIdMap) {
        console.log('\nSpeaker Mapping:');
        const entries = Object.entries(resolved.speakerIdMap).slice(0, 20);
        entries.forEach(([spkName, id]) => {
          console.log(`  ${spkName.padEnd(20)} -> ID ${id}`);
        });
        if (Object.keys(resolved.speakerIdMap).length > 20) {
          console.log(pc.dim(`  ... and ${Object.keys(resolved.speakerIdMap).length - 20} more speakers`));
        }
      }
      console.log('');
    } catch (err: any) {
      console.error(pc.red(`✖ Voice not found locally: ${err.message}`));
      process.exit(1);
    }
  });

// 4. CONFIG VALIDATE COMMAND
program
  .command('validate')
  .description('Validate a JSON configuration file against the schema')
  .requiredOption('-c, --config <file>', 'Path to JSON configuration file')
  .action(options => {
    try {
      const configPath = path.resolve(options.config);
      if (!fs.existsSync(configPath)) {
        console.error(pc.red(`Error: File not found at ${configPath}`));
        process.exit(1);
      }
      const raw = fs.readFileSync(configPath, 'utf8');
      const parsed = JSON.parse(raw);
      const res = ForgeConfigSchema.safeParse(parsed);

      if (res.success) {
        console.log(pc.green(`\n✔ Configuration in "${options.config}" is 100% VALID.\n`));
      } else {
        console.error(pc.red(`\n✖ Configuration in "${options.config}" is INVALID:`));
        res.error.errors.forEach(err => {
          console.error(`  - ${pc.yellow(err.path.join('.'))}: ${err.message}`);
        });
        console.log('');
        process.exit(1);
      }
    } catch (e: any) {
      console.error(pc.red(`\n✖ JSON Parse Error: ${e.message}\n`));
      process.exit(1);
    }
  });

// 5. INIT COMMAND
program
  .command('init')
  .description('Generate a starter JSON configuration file')
  .argument('[filename]', 'Output configuration filename', 'audioforge.config.json')
  .action(filename => {
    const target = path.resolve(filename);
    const sampleConfig: ForgeConfig = {
      version: '1.0',
      input: {
        text: 'Hello from Audio Forge! This audio was generated using Piper TTS with full resource monitoring.',
        batch: [
          {
            id: 'seg_1',
            text: 'Welcome to Audio Forge CLI.',
            speaker_id: 0,
            features: { length_scale: 1.0 },
          },
          {
            id: 'seg_2',
            text: 'This segment is spoken slightly faster.',
            speaker_id: 0,
            features: { length_scale: 0.85 },
          },
        ],
      },
      voice: {
        name: 'en_US-lessac-low',
        speaker_id: 0,
        features: {
          length_scale: 1.0,
          noise_scale: 0.667,
          noise_w: 0.8,
          sentence_silence: 0.2,
          volume: 1.0,
        },
      },
      piper_config: {
        use_cuda: false,
        auto_download_voice: true,
      },
      output: {
        path: './output/synthesized_speech.wav',
        format: 'wav',
      },
      monitor: {
        enabled: true,
        report_path: './output/performance_metrics.json',
        sample_interval_ms: 50,
      },
      cloud: {
        enabled: true,
        table_name: 'audio_generations',
        upload_audio: true,
        upload_report: true,
      },
    };

    fs.writeFileSync(target, JSON.stringify(sampleConfig, null, 2), 'utf8');
    console.log(pc.green(`✔ Created template configuration file at: ${pc.bold(target)}`));
    console.log(pc.dim('Run generation with:\n  audio-forge generate -c ' + filename + '\n'));
  });

program.parse(process.argv);
