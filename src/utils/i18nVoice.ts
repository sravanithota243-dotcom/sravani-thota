export interface LocalizedVoiceBundle {
  welcomeGreeting: string;
  switchAnnouncement: string;
  quickPrompts: string[];
  suggestedCommands: string[];
}

export const VOICE_BUNDLES: Record<string, LocalizedVoiceBundle> = {
  en: {
    welcomeGreeting:
      'Hello, I am the SkinSense Multilingual Voice Assistant. Select your preferred language, choose a scan for context, and tap Speak or type your question.',
    switchAnnouncement:
      'English is now active. I am ready to answer your questions and read your skin screening reports in English.',
    quickPrompts: [
      'Explain my scan confidence score and problem checking alert in simple terms.',
      'What warning signs should make me visit a dermatologist sooner?',
      'How can I capture a clearer follow-up photo for comparison?',
    ],
    suggestedCommands: [
      'Check my recent scans',
      'Explain current progress',
      'Summarize warning signs',
      'What should I monitor next?',
    ],
  },
  es: {
    welcomeGreeting:
      'Hola, soy el asistente de voz multilingüe de SkinSense. Seleccione su idioma preferido, elija un escaneo como contexto y toque Hablar o escriba su pregunta.',
    switchAnnouncement:
      'El español está ahora activo. Estoy listo para responder sus preguntas y leer sus informes dermatológicos en español.',
    quickPrompts: [
      'Explica mi puntuación de confianza y el mensaje de alerta en términos sencillos.',
      '¿Qué señales de advertencia indican que debo ver a un dermatólogo pronto?',
      '¿Cómo puedo tomar una foto de seguimiento más clara para comparar?',
    ],
    suggestedCommands: [
      'Revisar mis escaneos recientes',
      'Explicar el progreso actual',
      'Resumir señales de advertencia',
      '¿Qué debo vigilar ahora?',
    ],
  },
  hi: {
    welcomeGreeting:
      'नमस्ते, मैं स्किनसेंस बहुभाषी वॉयस असिस्टेंट हूँ। अपनी पसंदीदा भाषा चुनें, संदर्भ के लिए कोई स्कैन चुनें और बोलें दबाएं या अपना प्रश्न लिखें।',
    switchAnnouncement:
      'अब हिंदी भाषा सक्रिय है। मैं आपके सवालों के जवाब देने और आपकी त्वचा जांच रिपोर्ट हिंदी में पढ़ने के लिए तैयार हूँ।',
    quickPrompts: [
      'मेरे स्कैन के आत्मविश्वास स्कोर और समस्या जांच संदेश को सरल भाषा में समझाएं।',
      'किन चेतावनी संकेतों पर मुझे तुरंत त्वचा विशेषज्ञ से मिलना चाहिए?',
      'तुलना के लिए मैं अधिक स्पष्ट फ़ॉलो-अप फ़ोटो कैसे ले सकता हूँ?',
    ],
    suggestedCommands: [
      'मेरे हाल के स्कैन जांचें',
      'वर्तमान प्रगति समझाएं',
      'चेतावनी संकेत संक्षेप में बताएं',
      'आगे मुझे किस बात पर ध्यान देना चाहिए?',
    ],
  },
  fr: {
    welcomeGreeting:
      'Bonjour, je suis l’assistant vocal multilingue SkinSense. Choisissez votre langue, sélectionnez une analyse et appuyez sur Parler ou saisissez votre question.',
    switchAnnouncement:
      'Le français est maintenant activé. Je suis prêt à répondre à vos questions et à lire vos rapports dermatologiques en français.',
    quickPrompts: [
      'Expliquez mon score de confiance et le message d’alerte simplement.',
      'Quels signes doivent m’amener à consulter un dermatologue rapidement ?',
      'Comment prendre une photo de suivi plus nette pour la comparaison ?',
    ],
    suggestedCommands: [
      'Vérifier mes analyses récentes',
      'Expliquer les progrès actuels',
      'Résumer les signes d’alerte',
      'Que dois-je surveiller ensuite ?',
    ],
  },
  ar: {
    welcomeGreeting:
      'مرحبًا، أنا المساعد الصوتي متعدد اللغات من SkinSense. اختر لغتك المفضلة وحدد فحصًا للسياق ثم اضغط على تحدث أو اكتب سؤالك.',
    switchAnnouncement:
      'تم تفعيل اللغة العربية الآن. أنا جاهز للإجابة عن أسئلتك وقراءة تقارير فحص الجلد باللغة العربية.',
    quickPrompts: [
      'اشرح درجة الثقة ورسالة فحص المشكلة الخاصة بفحصي بعبارات بسيطة.',
      'ما علامات التحذير التي تستدعي زيارة طبيب الجلدية في وقت أقرب؟',
      'كيف يمكنني التقاط صورة متابعة أوضح للمقارنة؟',
    ],
    suggestedCommands: [
      'تحقق من فحوصاتي الأخيرة',
      'اشرح التقدم الحالي',
      'لخّص علامات التحذير',
      'ما الذي يجب مراقبته بعد ذلك؟',
    ],
  },
  zh: {
    welcomeGreeting:
      '您好，我是 SkinSense 多语言语音助手。请选择您偏好的语言，选择一个皮肤扫描记录作为上下文，然后点击“说话”或输入您的问题。',
    switchAnnouncement:
      '已切换为中文。我现在可以使用中文为您解答皮肤筛查问题并朗读报告摘要。',
    quickPrompts: [
      '请用通俗易懂的语言解释我的扫描置信度分数和问题检查提示。',
      '出现哪些警示信号时我应该尽快去看皮肤科医生？',
      '如何拍摄更清晰的复查照片以便进行对比？',
    ],
    suggestedCommands: [
      '查看我最近的扫描',
      '解释当前变化进展',
      '总结警示信号',
      '接下来需要重点关注什么？',
    ],
  },
  pt: {
    welcomeGreeting:
      'Olá, sou o assistente de voz multilíngue do SkinSense. Selecione seu idioma, escolha um exame como contexto e toque em Falar ou digite sua pergunta.',
    switchAnnouncement:
      'O idioma português está ativo agora. Estou pronto para responder às suas perguntas e ler seus relatórios em português.',
    quickPrompts: [
      'Explique a pontuação de confiança e o alerta de verificação do meu exame em termos simples.',
      'Quais sinais de alerta indicam que devo consultar um dermatologista mais cedo?',
      'Como posso capturar uma foto de acompanhamento mais nítida para comparação?',
    ],
    suggestedCommands: [
      'Verificar meus exames recentes',
      'Explicar o progresso atual',
      'Resumir sinais de alerta',
      'O que devo monitorar a seguir?',
    ],
  },
  de: {
    welcomeGreeting:
      'Hallo, ich bin der mehrsprachige SkinSense-Sprachassistent. Wählen Sie Ihre Sprache, wählen Sie einen Scan als Kontext aus und tippen Sie auf Sprechen oder geben Sie Ihre Frage ein.',
    switchAnnouncement:
      'Deutsch ist jetzt aktiv. Ich bin bereit, Ihre Fragen zu beantworten und Ihre Hautberichte auf Deutsch vorzulesen.',
    quickPrompts: [
      'Erklären Sie meinen Konfidenzwert und die Problemprüfungsmeldung in einfachen Worten.',
      'Welche Warnzeichen sprechen dafür, früher eine Hautarztpraxis aufzusuchen?',
      'Wie mache ich ein schärferes Verlaufsfoto für den Vergleich?',
    ],
    suggestedCommands: [
      'Meine letzten Scans prüfen',
      'Aktuellen Verlauf erklären',
      'Warnzeichen zusammenfassen',
      'Worauf soll ich als Nächstes achten?',
    ],
  },
  te: {
    welcomeGreeting:
      'నమస్కారం, నేను స్కిన్‌సెన్స్ బహుభాషా వాయిస్ అసిస్టెంట్‌ను. మీ భాషను ఎంచుకుని, స్కాన్ సందర్భాన్ని ఎంచుకొని మాట్లాడండి లేదా మీ ప్రశ్నను టైప్ చేయండి.',
    switchAnnouncement:
      'ఇప్పుడు తెలుగు భాష ప్రారంభమైంది. మీ ప్రశ్నలకు సమాధానం చెప్పడానికి మరియు మీ స్కిన్ స్క్రీనింగ్ నివేదికను తెలుగులో చదవడానికి నేను సిద్ధంగా ఉన్నాను.',
    quickPrompts: [
      'నా స్కాన్ కాన్ఫిడెన్స్ స్కోర్ మరియు హెచ్చరిక సందేశాన్ని సులభమైన భాషలో వివరించండి.',
      'ఏ లక్షణాలు కనిపిస్తే నేను వెంటనే చర్మవ్యాధి నిపుణుడిని కలవాలి?',
      'పోలిక కోసం మరింత స్పష్టమైన ఫాలో-అప్ ఫోటోను ఎలా తీయాలి?',
    ],
    suggestedCommands: [
      'నా ఇటీవలి స్కాన్‌లను తనిఖీ చేయండి',
      'ప్రస్తుత పురోగతిని వివరించండి',
      'హెచ్చరిక సంకేతాలను సంగ్రహించండి',
      'తర్వాత నేను ఏమి గమనించాలి?',
    ],
  },
  ta: {
    welcomeGreeting:
      'வணக்கம், நான் ஸ்கின்சென்ஸ் பலமொழி குரல் உதவியாளர். உங்கள் விருப்ப மொழியைத் தேர்ந்தெடுத்து, ஒரு ஸ்கேன் பதிவைத் தேர்ந்தெடுத்து பேசுங்கள் அல்லது உங்கள் கேள்வியை தட்டச்சு செய்யுங்கள்.',
    switchAnnouncement:
      'இப்போது தமிழ் மொழி இயக்கப்பட்டுள்ளது. உங்கள் கேள்விகளுக்குப் பதிலளிக்கவும் தோல் பரிசோதனை அறிக்கைகளை தமிழில் வாசிக்கவும் நான் தயாராக உள்ளேன்.',
    quickPrompts: [
      'எனது ஸ்கேன் நம்பிக்கை மதிப்பெண் மற்றும் எச்சரிக்கை செய்தியை எளிய தமிழில் விளக்குங்கள்.',
      'எந்த அறிகுறிகள் இருந்தால் நான் விரைவில் தோல் மருத்துவரைப் பார்க்க வேண்டும்?',
      'ஒப்பீட்டிற்காக தெளிவான பின்தொடர் புகைப்படத்தை எவ்வாறு எடுப்பது?',
    ],
    suggestedCommands: [
      'எனது சமீபத்திய ஸ்கேன்களைச் சரிபார்க்கவும்',
      'தற்போதைய முன்னேற்றத்தை விளக்கவும்',
      'எச்சரிக்கை அறிகுறிகளைச் சுருக்கவும்',
      'அடுத்து நான் எதைக் கவனிக்க வேண்டும்?',
    ],
  },
};

export function getVoiceBundle(languageCode: string): LocalizedVoiceBundle {
  return VOICE_BUNDLES[languageCode] || VOICE_BUNDLES.en;
}
