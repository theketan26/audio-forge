use crate::types::VisemeId;
use std::collections::HashMap;

#[derive(Debug, Clone, PartialEq)]
pub enum ScriptToken {
    Phoneme {
        symbol: String,
        duration_ms: f32,
        pitch_multiplier: f32,
        viseme: VisemeId,
        is_voiced: bool,
    },
    Pause {
        duration_ms: f32,
    },
}

#[derive(Debug, Clone)]
pub struct TextSegment {
    pub text: String,
    pub pitch_offset: f32, // multiplier, default 1.0
    pub speed_offset: f32, // multiplier, default 1.0
    pub pause_after_ms: f32,
}

pub struct G2pEngine {
    dict: HashMap<String, Vec<&'static str>>,
}

impl G2pEngine {
    pub fn new() -> Self {
        let mut dict = HashMap::new();
        // Populate core English dictionary
        let words: &[(&str, &[&str])] = &[
            ("hello", &["HH", "AH", "L", "OW"]),
            ("world", &["W", "ER", "L", "D"]),
            ("audio", &["AO", "D", "IY", "OW"]),
            ("forge", &["F", "AO", "R", "JH"]),
            ("this", &["DH", "IH", "S"]),
            ("is", &["IH", "Z"]),
            ("a", &["AH"]),
            ("the", &["DH", "AH"]),
            ("game", &["G", "EY", "M"]),
            ("developer", &["D", "IH", "V", "EH", "L", "AH", "P", "ER"]),
            ("animation", &["AE", "N", "AH", "M", "EY", "SH", "AH", "N"]),
            ("speech", &["S", "P", "IY", "CH"]),
            ("synthesis", &["S", "IH", "N", "TH", "AH", "S", "AH", "S"]),
            ("lip", &["L", "IH", "P"]),
            ("sync", &["S", "IH", "NG", "K"]),
            ("engine", &["EH", "N", "JH", "AH", "N"]),
            ("retro", &["R", "EH", "T", "R", "OW"]),
            ("welcome", &["W", "EH", "L", "K", "AH", "M"]),
            ("to", &["T", "UW"]),
            ("in", &["IH", "N"]),
            ("on", &["AA", "N"]),
            ("at", &["AE", "T"]),
            ("for", &["F", "AO", "R"]),
            ("with", &["W", "IH", "DH"]),
            ("you", &["Y", "UW"]),
            ("are", &["AA", "R"]),
            ("can", &["K", "AE", "N"]),
            ("hear", &["HH", "IH", "R"]),
            ("me", &["M", "IY"]),
            ("now", &["N", "AW"]),
            ("yes", &["Y", "EH", "S"]),
            ("no", &["N", "OW"]),
            ("stop", &["S", "T", "AA", "P"]),
            ("go", &["G", "OW"]),
            ("ready", &["R", "EH", "D", "IY"]),
            ("player", &["P", "L", "EY", "ER"]),
            ("one", &["W", "AH", "N"]),
            ("two", &["T", "UW"]),
            ("three", &["TH", "R", "IY"]),
            ("four", &["F", "AO", "R"]),
            ("five", &["F", "AY", "V"]),
            ("start", &["S", "T", "AA", "R", "T"]),
            ("hero", &["HH", "IH", "R", "OW"]),
            ("quest", &["K", "W", "EH", "S", "T"]),
            ("dialogue", &["D", "AY", "AH", "L", "AO", "G"]),
            ("sound", &["S", "AW", "N", "D"]),
            ("voice", &["V", "OY", "S"]),
            ("actor", &["AE", "K", "T", "ER"]),
            ("studio", &["S", "T", "UW", "D", "IY", "OW"]),
            ("timeline", &["T", "AY", "M", "L", "AY", "N"]),
            ("sample", &["S", "AE", "M", "P", "AH", "L"]),
            ("rate", &["R", "EY", "T"]),
            ("frame", &["F", "R", "EY", "M"]),
            ("viseme", &["V", "IH", "Z", "IY", "M"]),
            ("mouth", &["M", "AW", "TH"]),
            ("shape", &["SH", "EY", "P"]),
            ("test", &["T", "EH", "S", "T"]),
            ("check", &["CH", "EH", "K"]),
            ("system", &["S", "IH", "S", "T", "AH", "M"]),
            ("online", &["AO", "N", "L", "AY", "N"]),
            ("great", &["G", "R", "EY", "T"]),
            ("awesome", &["AO", "S", "AH", "M"]),
            ("magic", &["M", "AE", "JH", "IH", "K"]),
            ("power", &["P", "AW", "ER"]),
            ("level", &["L", "EH", "V", "AH", "L"]),
            ("up", &["AH", "P"]),
            ("down", &["D", "AW", "N"]),
            ("left", &["L", "EH", "F", "T"]),
            ("right", &["R", "AY", "T"]),
            ("look", &["L", "UH", "K"]),
            ("see", &["S", "IY"]),
            ("speak", &["S", "P", "IY", "K"]),
            ("talk", &["T", "AO", "K"]),
            ("listen", &["L", "IH", "S", "AH", "N"]),
            ("what", &["W", "AH", "T"]),
            ("why", &["W", "AY"]),
            ("where", &["W", "EH", "R"]),
            ("who", &["HH", "UW"]),
            ("when", &["W", "EH", "N"]),
            ("how", &["HH", "AW"]),
            ("good", &["G", "UH", "D"]),
            ("morning", &["M", "AO", "R", "N", "IH", "NG"]),
            ("night", &["N", "AY", "T"]),
            ("friend", &["F", "R", "EH", "N", "D"]),
            ("enemy", &["EH", "N", "AH", "M", "IY"]),
            ("danger", &["D", "EY", "N", "JH", "ER"]),
            ("run", &["R", "AH", "N"]),
            ("jump", &["JH", "AH", "M", "P"]),
            ("attack", &["AH", "T", "AE", "K"]),
            ("shield", &["SH", "IY", "L", "D"]),
            ("sword", &["S", "AO", "R", "D"]),
        ];

        for (word, phones) in words {
            dict.insert(word.to_string(), phones.to_vec());
        }

        Self { dict }
    }

    /// Maps ARPAbet phoneme to viseme category
    pub fn phoneme_to_viseme(phone: &str) -> VisemeId {
        match phone {
            "B" | "M" | "P" => VisemeId::Closed,
            "F" | "V" => VisemeId::TeethLip,
            "D" | "DH" | "L" | "N" | "S" | "T" | "TH" | "Z" => VisemeId::SlightOpen,
            "CH" | "ER" | "G" | "JH" | "K" | "NG" | "R" | "SH" | "Y" | "ZH" => VisemeId::JawOpen,
            "AA" | "AE" | "AH" | "AW" | "AY" => VisemeId::WideOpen,
            "AO" | "OW" | "OY" | "W" => VisemeId::Round,
            "UH" | "UW" => VisemeId::Pucker,
            _ => VisemeId::Rest,
        }
    }

    pub fn is_voiced_phoneme(phone: &str) -> bool {
        match phone {
            "AA" | "AE" | "AH" | "AO" | "AW" | "AY" | "EH" | "ER" | "EY" | "IH" | "IY" | "OW"
            | "OY" | "UH" | "UW" | "B" | "D" | "G" | "JH" | "L" | "M" | "N" | "NG" | "R" | "V"
            | "W" | "Y" | "Z" | "ZH" | "DH" => true,
            _ => false, // P, T, K, CH, F, TH, S, SH, HH are unvoiced
        }
    }

    pub fn phoneme_default_duration_ms(phone: &str) -> f32 {
        match phone {
            // Vowels tend to be longer
            "AA" | "AO" | "AW" | "AY" | "ER" | "EY" | "IY" | "OW" | "OY" | "UW" => 120.0,
            "AE" | "AH" | "EH" | "IH" | "UH" => 95.0,
            // Plosives/stops are punchy
            "B" | "D" | "G" | "P" | "T" | "K" => 65.0,
            // Fricatives/nasals
            "S" | "SH" | "Z" | "ZH" | "F" | "TH" | "V" | "DH" => 85.0,
            "M" | "N" | "NG" | "L" | "R" | "W" | "Y" | "CH" | "JH" => 75.0,
            "HH" => 55.0,
            _ => 80.0,
        }
    }

    /// Rule-based fallback for words not in the dictionary
    pub fn fallback_g2p(word: &str) -> Vec<String> {
        let chars: Vec<char> = word.to_lowercase().chars().collect();
        let mut phonemes = Vec::new();
        let mut i = 0;

        while i < chars.len() {
            let c = chars[i];
            let next_c = if i + 1 < chars.len() { Some(chars[i + 1]) } else { None };

            if c == 't' && next_c == Some('h') {
                phonemes.push("TH".to_string());
                i += 2;
                continue;
            }
            if c == 's' && next_c == Some('h') {
                phonemes.push("SH".to_string());
                i += 2;
                continue;
            }
            if c == 'c' && next_c == Some('h') {
                phonemes.push("CH".to_string());
                i += 2;
                continue;
            }
            if c == 'p' && next_c == Some('h') {
                phonemes.push("F".to_string());
                i += 2;
                continue;
            }
            if c == 'n' && next_c == Some('g') {
                phonemes.push("NG".to_string());
                i += 2;
                continue;
            }
            if c == 'e' && next_c == Some('e') {
                phonemes.push("IY".to_string());
                i += 2;
                continue;
            }
            if c == 'o' && next_c == Some('o') {
                phonemes.push("UW".to_string());
                i += 2;
                continue;
            }
            if c == 'a' && next_c == Some('i') {
                phonemes.push("EY".to_string());
                i += 2;
                continue;
            }
            if c == 'e' && next_c == Some('a') {
                phonemes.push("IY".to_string());
                i += 2;
                continue;
            }
            if c == 'o' && next_c == Some('u') {
                phonemes.push("AW".to_string());
                i += 2;
                continue;
            }

            let phone = match c {
                'a' => "AE",
                'b' => "B",
                'c' => "K",
                'd' => "D",
                'e' => "EH",
                'f' => "F",
                'g' => "G",
                'h' => "HH",
                'i' => "IH",
                'j' => "JH",
                'k' => "K",
                'l' => "L",
                'm' => "M",
                'n' => "N",
                'o' => "AA",
                'p' => "P",
                'q' => "K",
                'r' => "R",
                's' => "S",
                't' => "T",
                'u' => "AH",
                'v' => "V",
                'w' => "W",
                'x' => "S",
                'y' => "Y",
                'z' => "Z",
                _ => "",
            };

            if !phone.is_empty() {
                phonemes.push(phone.to_string());
            }
            i += 1;
        }

        if phonemes.is_empty() {
            phonemes.push("AH".to_string());
        }

        phonemes
    }

    pub fn word_to_phonemes(&self, word: &str) -> Vec<String> {
        let clean = word
            .trim_matches(|c: char| !c.is_alphanumeric())
            .to_lowercase();
        if clean.is_empty() {
            return Vec::new();
        }

        if let Some(list) = self.dict.get(&clean) {
            return list.iter().map(|s| s.to_string()).collect();
        }

        Self::fallback_g2p(&clean)
    }

    /// Parses text with inline SSML-lite badges:
    /// e.g. "Hello [pause:200ms] world! [pitch:+15%] Ready?"
    pub fn parse_script(&self, input: &str, base_speed: f32) -> Vec<ScriptToken> {
        let mut tokens = Vec::new();
        let mut current_pitch_mult: f32 = 1.0;
        let mut current_speed_mult: f32 = 1.0;

        let parts = Self::split_ssml_tags(input);

        for part in parts {
            match part {
                ParsedPart::Tag(tag) => {
                    let tag = tag.trim();
                    if let Some(rest) = tag.strip_prefix("pause:") {
                        let ms = Self::parse_time_ms(rest);
                        tokens.push(ScriptToken::Pause { duration_ms: ms });
                    } else if let Some(rest) = tag.strip_prefix("pitch:") {
                        if let Some(pct) = rest.strip_suffix('%') {
                            if let Ok(val) = pct.parse::<f32>() {
                                current_pitch_mult = 1.0 + (val / 100.0);
                            }
                        } else if let Some(hz) = rest.strip_suffix("hz") {
                            if let Ok(val) = hz.parse::<f32>() {
                                current_pitch_mult = val / 130.0;
                            }
                        }
                    } else if let Some(rest) = tag.strip_prefix("speed:") {
                        if let Ok(val) = rest.parse::<f32>() {
                            current_speed_mult = val.max(0.2).min(3.0);
                        }
                    } else if let Some(rest) = tag.strip_prefix("viseme:") {
                        let vis = match rest {
                            "closed" => VisemeId::Closed,
                            "wide_open" => VisemeId::WideOpen,
                            "round" => VisemeId::Round,
                            "pucker" => VisemeId::Pucker,
                            "teeth_lip" => VisemeId::TeethLip,
                            "jaw_open" => VisemeId::JawOpen,
                            "slight_open" => VisemeId::SlightOpen,
                            _ => VisemeId::Rest,
                        };
                        tokens.push(ScriptToken::Phoneme {
                            symbol: "VIS_OVERRIDE".to_string(),
                            duration_ms: 120.0 / (base_speed * current_speed_mult),
                            pitch_multiplier: current_pitch_mult,
                            viseme: vis,
                            is_voiced: true,
                        });
                    }
                }
                ParsedPart::Text(clause) => {
                    let words_with_punct = Self::tokenize_clause(&clause);
                    let clause_len = words_with_punct.len();

                    for (idx, (word, punctuation)) in words_with_punct.into_iter().enumerate() {
                        let phonemes = self.word_to_phonemes(&word);
                        let num_phones = phonemes.len();

                        for (p_idx, phone) in phonemes.iter().enumerate() {
                            let mut pitch_mod = current_pitch_mult;

                            // Apply punctuation dynamic contours
                            let is_last_phone_in_clause =
                                (idx == clause_len - 1) && (p_idx == num_phones - 1);

                            if let Some(punct) = punctuation {
                                match punct {
                                    '?' => {
                                        // +25% sweep towards end of clause
                                        if is_last_phone_in_clause {
                                            pitch_mod *= 1.25;
                                        } else if idx + 1 >= clause_len {
                                            pitch_mod *= 1.12;
                                        }
                                    }
                                    '!' => {
                                        // Punchy attack
                                        pitch_mod *= 1.20;
                                    }
                                    '.' | ';' => {
                                        // Pitch drop
                                        if is_last_phone_in_clause {
                                            pitch_mod *= 0.85;
                                        }
                                    }
                                    ',' => {
                                        if is_last_phone_in_clause {
                                            pitch_mod *= 1.05;
                                        }
                                    }
                                    _ => {}
                                }
                            }

                            let base_dur = Self::phoneme_default_duration_ms(phone);
                            let dur = base_dur / (base_speed * current_speed_mult);
                            let vis = Self::phoneme_to_viseme(phone);
                            let voiced = Self::is_voiced_phoneme(phone);

                            tokens.push(ScriptToken::Phoneme {
                                symbol: phone.clone(),
                                duration_ms: dur,
                                pitch_multiplier: pitch_mod,
                                viseme: vis,
                                is_voiced: voiced,
                            });
                        }

                        // Word spacing pause
                        tokens.push(ScriptToken::Pause { duration_ms: 30.0 / base_speed });

                        // Punctuation pauses
                        if let Some(punct) = punctuation {
                            match punct {
                                '?' | '!' | '.' | ';' => {
                                    tokens.push(ScriptToken::Pause { duration_ms: 180.0 / base_speed });
                                }
                                ',' | ':' => {
                                    tokens.push(ScriptToken::Pause { duration_ms: 90.0 / base_speed });
                                }
                                _ => {}
                            }
                        }
                    }
                }
            }
        }

        tokens
    }

    fn split_ssml_tags(input: &str) -> Vec<ParsedPart> {
        let mut parts = Vec::new();
        let mut curr = String::new();
        let mut in_tag = false;

        for c in input.chars() {
            if c == '[' && !in_tag {
                if !curr.is_empty() {
                    parts.push(ParsedPart::Text(curr.clone()));
                    curr.clear();
                }
                in_tag = true;
            } else if c == ']' && in_tag {
                parts.push(ParsedPart::Tag(curr.clone()));
                curr.clear();
                in_tag = false;
            } else {
                curr.push(c);
            }
        }

        if !curr.is_empty() {
            if in_tag {
                parts.push(ParsedPart::Tag(curr));
            } else {
                parts.push(ParsedPart::Text(curr));
            }
        }

        parts
    }

    fn tokenize_clause(clause: &str) -> Vec<(String, Option<char>)> {
        let mut res = Vec::new();
        for raw in clause.split_whitespace() {
            let mut word = String::new();
            let mut punct = None;

            for c in raw.chars() {
                if c.is_alphanumeric() || c == '\'' || c == '-' {
                    word.push(c);
                } else if "?!.,;:".contains(c) {
                    punct = Some(c);
                }
            }

            if !word.is_empty() {
                res.push((word, punct));
            }
        }
        res
    }

    fn parse_time_ms(val: &str) -> f32 {
        let val = val.trim().to_lowercase();
        if let Some(s) = val.strip_suffix("ms") {
            s.parse::<f32>().unwrap_or(100.0)
        } else if let Some(s) = val.strip_suffix('s') {
            s.parse::<f32>().map(|v| v * 1000.0).unwrap_or(100.0)
        } else {
            val.parse::<f32>().unwrap_or(100.0)
        }
    }
}

enum ParsedPart {
    Text(String),
    Tag(String),
}
