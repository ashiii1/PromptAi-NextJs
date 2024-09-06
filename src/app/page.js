'use client'

import React from 'react';
import { useState, useRef, useEffect, useCallback } from "react";
import { FaPencilAlt, FaHeading, FaListUl, FaQuoteRight, FaBolt, FaBullhorn, FaHashtag, FaUserAstronaut, FaGlobe, FaPaperPlane, FaLanguage, FaBars, FaChevronLeft, FaTimes } from 'react-icons/fa';
import { performSearch, formatSearchResults } from '../utils/searchUtils';

if (typeof window !== 'undefined') {
  window.env = {
    NEXT_PUBLIC_GOOGLE_SEARCH_API_KEY: process.env.NEXT_PUBLIC_GOOGLE_SEARCH_API_KEY,
    NEXT_PUBLIC_GOOGLE_SEARCH_ENGINE_ID: process.env.NEXT_PUBLIC_GOOGLE_SEARCH_ENGINE_ID,
  };
}

export default function Home() {
  const [value, setValue] = useState("");
  const [chatHistory, setChatHistory] = useState([]);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [workspaces, setWorkspaces] = useState([]);
  const [currentWorkspace, setCurrentWorkspace] = useState(null);
  const chatEndRef = useRef(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [data, setData] = useState({});
  const sidebarRef = useRef(null);
  const [showPromptBoxes, setShowPromptBoxes] = useState(true);
  const [language, setLanguage] = useState('en');
  const [showLanguageDropdown, setShowLanguageDropdown] = useState(false);
  const [selectedPrompt, setSelectedPrompt] = useState(null);

  // Load workspaces and current workspace on component mount
  useEffect(() => {
    const savedWorkspaces = JSON.parse(localStorage.getItem('workspaces')) || [];
    setWorkspaces(savedWorkspaces);

    const lastWorkspaceId = localStorage.getItem('currentWorkspaceId');
    const lastWorkspace = savedWorkspaces.find(w => w.id.toString() === lastWorkspaceId);
    if (lastWorkspace) {
      setCurrentWorkspace(lastWorkspace);
      setChatHistory(lastWorkspace.history || []); // This line ensures the chat history is loaded
    }
  }, []);

  // Save workspaces to local storage whenever they change
  useEffect(() => {
    if (workspaces.length > 0) {
      localStorage.setItem('workspaces', JSON.stringify(workspaces));
    }
  }, [workspaces]);

  // Save current workspace ID whenever it changes
  useEffect(() => {
    if (currentWorkspace) {
      localStorage.setItem('currentWorkspaceId', currentWorkspace.id.toString());
    }
  }, [currentWorkspace]);

  // Get context from data
  const getContextFromData = () => {
    return `
      Instructions: ${data.instructions?.map((instruction, index) => `${index + 1}. ${Object.values(instruction)[0]}`).join(' | ') || 'N/A'}
    `;
  };

  const createNewWorkspace = (title = null) => {
    let truncatedTitle = title;
    if (title) {
      const words = title.split(' ');
      truncatedTitle = words.slice(0, 2).join(' ');
      if (words.length > 2) {
        truncatedTitle += '...';
      }
    }

    const newWorkspace = {
      id: Date.now(),
      name: truncatedTitle || `Workspace ${workspaces.length + 1}`,
      history: []
    };
    setWorkspaces(prevWorkspaces => {
      const updatedWorkspaces = [...prevWorkspaces, newWorkspace];
      localStorage.setItem('workspaces', JSON.stringify(updatedWorkspaces));
      return updatedWorkspaces;
    });
    setCurrentWorkspace(newWorkspace);
    setChatHistory([]);
    setShowPromptBoxes(true); // Reset showPromptBoxes to true
    localStorage.setItem('currentWorkspaceId', newWorkspace.id.toString());
    return newWorkspace;
  };

  const translateMessage = async (message, targetLang) => {
    // This is a placeholder. You should implement actual translation logic here.
    // For now, we'll just return the original message.
    return message;
  };

  const getResponse = async (message = value, isPromptBox = false, promptTitle = null) => {
    if (!message.trim()) {
      setError(t("askQuestion"));
      return;
    }
    setError("");
    if (!isPromptBox) {
      setShowPromptBoxes(false);
    }

    if (!currentWorkspace) {
      const newWorkspace = createNewWorkspace(message);
      setCurrentWorkspace(newWorkspace);
    }

    const isFirstMessage = chatHistory.length === 0;
    const context = getContextFromData();
    const systemInstruction = `You have access to recent internet search results for every user query. These results will be provided to you in the context. Use this information when relevant to the conversation. Always cite your sources by providing the URLs of the resources you used in your response. Format the sources on a new line starting with "Source: " followed by the URL.`;
    const userMessage = isFirstMessage ? systemInstruction + message : message;
    setValue("");
    setIsLoading(true);

    try {
      // Perform initial search
      const searchResults = await performSearch(message);
      const formattedResults = formatSearchResults(searchResults);
      
      const updatedContext = `${context}\n\nRecent Internet Search Results for "${message}":\n${formattedResults}\n\nUse these search results to inform your response when relevant. Always cite your sources by providing the URLs of the resources you used. Format the sources on a new line starting with "Source: " followed by the URL. Only if you you can't reply to the user's query, start your response with "/search" followed by what you need to search for.`;

      let newHistory = isPromptBox
        ? [...chatHistory, { role: "user", parts: promptTitle }]
        : [...chatHistory, { role: "user", parts: message }];
      setChatHistory(newHistory);

      const options = {
        method: "POST",
        body: JSON.stringify({
          history: newHistory,
          message: `${systemInstruction}\n\nUser query: ${isPromptBox ? message : value}\n\n${updatedContext}`,
          context: updatedContext
        }),
        headers: {
          'Content-Type': 'application/json'
        }
      };
      
      const apiUrl = '/api/gemini';
      const response = await fetch(apiUrl, options);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const responseData = await response.json();
      let aiResponse = responseData.text;
      
      // Check if the AI needs more information
      if (aiResponse.startsWith("/search")) {
        const searchQuery = aiResponse.slice(7).trim(); // Remove "/search " prefix
        const additionalSearchResults = await performSearch(searchQuery);
        const formattedAdditionalResults = formatSearchResults(additionalSearchResults);
        
        const additionalContext = `Additional search results for "${searchQuery}":\n${formattedAdditionalResults}\n\nPlease provide an updated response based on this additional information only when needed. Remember to cite your sources.`;
        
        const newOptions = {
          ...options,
          body: JSON.stringify({
            history: [...newHistory, { role: "model", parts: aiResponse }],
            message: additionalContext,
            context: updatedContext + "\n\n" + additionalContext
          })
        };
        
        const newResponse = await fetch(apiUrl, newOptions);
        if (!newResponse.ok) {
          throw new Error(`HTTP error! status: ${newResponse.status}`);
        }
        const newResponseData = await newResponse.json();
        aiResponse = newResponseData.text;
      }

      let translatedResponse = aiResponse;
      
      if (language === 'ar') {
        translatedResponse = await translateMessage(aiResponse, 'ar');
      }

      const updatedHistory = [
        ...newHistory,
        { role: "model", parts: translatedResponse }
      ];
      setChatHistory(updatedHistory);
      setSelectedPrompt(null); // Reset selected prompt after response

      if (currentWorkspace) {
        let truncatedName = isPromptBox ? promptTitle : message;
        const words = truncatedName.split(' ');
        if (words.length > 2) {
          truncatedName = words.slice(0, 2).join(' ') + '...';
        }
        const updatedWorkspace = {
          ...currentWorkspace, 
          history: updatedHistory,
          name: currentWorkspace.history.length === 0 ? truncatedName : currentWorkspace.name
        };
        setCurrentWorkspace(updatedWorkspace);
        setWorkspaces(prevWorkspaces => {
          const newWorkspaces = prevWorkspaces.map(w => 
            w.id === updatedWorkspace.id ? updatedWorkspace : w
          );
          localStorage.setItem('workspaces', JSON.stringify(newWorkspaces));
          return newWorkspaces;
        });
      }
    } catch (error) {
      console.error('Error:', error);
      setError(t("error"));
      setSelectedPrompt(null); // Reset selected prompt on error
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory]);

  const deleteWorkspace = (workspaceId) => {
    setWorkspaces(prevWorkspaces => {
      const updatedWorkspaces = prevWorkspaces.filter(w => w.id !== workspaceId);
      localStorage.setItem('workspaces', JSON.stringify(updatedWorkspaces));
      return updatedWorkspaces;
    });

    if (currentWorkspace && currentWorkspace.id === workspaceId) {
      const remainingWorkspaces = workspaces.filter(w => w.id !== workspaceId);
      if (remainingWorkspaces.length > 0) {
        const newCurrentWorkspace = remainingWorkspaces[0];
        setCurrentWorkspace(newCurrentWorkspace);
        setChatHistory(newCurrentWorkspace.history || []);
        setShowPromptBoxes(newCurrentWorkspace.history.length === 0);
        localStorage.setItem('currentWorkspaceId', newCurrentWorkspace.id.toString());
      } else {
        setCurrentWorkspace(null);
        setChatHistory([]);
        setShowPromptBoxes(true);
        localStorage.removeItem('currentWorkspaceId');
      }
    }
  };

  const toggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };

  const renderFormattedMessage = (message) => {
    const lines = message.split('\n');
    return lines.map((line, lineIndex) => {
      // Regular expression to match URLs and "Source: " prefix
      const urlRegex = /(https?:\/\/[^\s]+)/g;
      const sourceRegex = /^Source:\s*(https?:\/\/[^\s]+)/;
      
      if (sourceRegex.test(line)) {
        const [, url] = line.match(sourceRegex);
        return React.createElement(React.Fragment, { key: lineIndex }, [
          React.createElement('br', { key: 'br' }),
          React.createElement('strong', { key: 'source' }, 'Source: '),
          React.createElement('a', {
            key: 'link',
            href: url,
            target: "_blank",
            rel: "noopener noreferrer",
            className: "text-blue-400 hover:underline"
          }, url)
        ]);
      }
      
      const parts = line.split(urlRegex);
      
      return React.createElement(React.Fragment, { key: lineIndex }, [
        lineIndex > 0 && React.createElement('br', { key: `br-${lineIndex}` }),
        ...parts.map((part, partIndex) => {
          if (urlRegex.test(part)) {
            // If the part is a URL, render it as a clickable link
            return React.createElement('a', {
              key: partIndex,
              href: part,
              target: "_blank",
              rel: "noopener noreferrer",
              className: "text-blue-400 hover:underline"
            }, part);
          } else if (part.startsWith('**') && part.endsWith('**')) {
            return React.createElement('strong', { key: partIndex }, part.slice(2, -2));
          } else if (part.trim().startsWith('*')) {
            return React.createElement(React.Fragment, { key: partIndex }, [
              React.createElement('br', { key: `bullet-br-${partIndex}` }),
              `• ${part.trim().slice(1).trim()}`
            ]);
          } else {
            return React.createElement(React.Fragment, { key: partIndex }, part);
          }
        })
      ]);
    });
  };

  useEffect(() => {
    async function fetchData() {
      try {
        const response = await fetch('/api/getData');
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const jsonData = await response.json();
        setData(jsonData);
      } catch (error) {
        console.error("Failed to fetch data:", error);
      }
    }
    fetchData();
  }, []);

  useEffect(() => {
    function handleClickOutside(event) {
      if (sidebarRef.current && !sidebarRef.current.contains(event.target) && isSidebarOpen) {
        setIsSidebarOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isSidebarOpen]);

  const promptBoxes = [
    { icon: <FaBolt />, text: "craftViralHook" },
    { icon: <FaBullhorn />, text: "createPersuasiveAdCopy" },
    { icon: <FaHashtag />, text: "generateTrendingHashtags" },
    { icon: <FaUserAstronaut />, text: "developBrandPersona" },
  ];

  const detailedPrompts = {
    en: {
      craftViralHook: "You are a social media expert, and I need your help crafting a viral hook for my product. Ask simple clarifying questions one at a time—ask a question, wait for the response, then proceed to the next question. Gather all the necessary information about the product and target audience before providing a tailored answer or solution. Then, create an attention-grabbing opening line or concept that will make people want to learn more and share with others.",
      createPersuasiveAdCopy: "You are a copywriting genius, and I need your help creating persuasive ad copy. Ask simple clarifying questions one at a time—ask a question, wait for the response, then proceed to the next question. Gather all the necessary information about the product and its benefits before providing a tailored answer or solution. Then, write a compelling advertisement that highlights the key benefits of my product and convinces the reader to take action.",
      generateTrendingHashtags: "You are a social media trend analyst, and I need your help generating trending hashtags. Ask simple clarifying questions one at a time—ask a question, wait for the response, then proceed to the next question. Gather all the necessary information about the campaign or brand before providing a tailored answer or solution. Then, create a list of 5-10 potential hashtags that could go viral and increase visibility for my brand or campaign.",
      developBrandPersona: "You are a brand strategist, and I need your help developing a brand persona. Ask simple clarifying questions one at a time—ask a question, wait for the response, then proceed to the next question. Gather all the necessary information about the brand's values and target audience before providing a tailored answer or solution. Then, create a detailed description of my brand's personality, voice, and values as if it were a real person. Include traits that will resonate with my target audience."
    },
    ar: {
      craftViralHook: "أنت خبير في وسائل التواصل الاجتماعي، وحتاج مساعدتك في صياغة عنوان جذاب متجي. اطرح أسئلة توضيحية بسيطة واحدة تلو الخرى—اطرح سؤالًا، انتظر الرد، ثم انتقل إلى السؤال التالي. اجمع كل المعلومات اللازمة عن المنتج والجمهور المستهدف قبل تقديم إجابة أو حل مخصص. ثم ابتكر جملة افتتاحية أو فكرة تلفت الانتباه وتحز الناس على معرفة المزيد ومشاركتها مع الخرين.",
      createPersuasiveAdCopy: "أنت عبقري في كتابة النصوص الإعلانية، وأحتاج إلى مساعدتك في إنشاء نص إعلاني قنع. اطرح أسئلة توضيحية بسيطة واحدة تلو الأخرى—اطرح سؤالًا، انتظر الرد، ثم انتقل إلى السؤال التالي. اجمع كل المعلومات اللازمة عن المنتج وفوائده قبل تقديم إجابة أو حل مخصص. ثم اكتب إعلانًا ؤثرًا يبرز المزايا الرئيسية لمنتجي ويحث القارئ على اتخاذ إجراء.",
      generateTrendingHashtags: "أنت محلل اتجاهات في وسائل التواصل الاجتماعي، وأحتاج مساعدك في إنشاء هاشتاغات رائجة. اطرح أسئلة توضيحية بسيطة واحدة تلو الأخرى—اطرح سؤالًا، انتر الرد، ثم انتقل إلى السؤال التالي. اجمع كل المعلومات اللازمة عن الحملة أو العلامة التجارية قبل تقديم إجابة أو حل مخصص. ثم قم بإنشاء قائمة من 5-10 هاشتاغات محتملة يمكن أن تصبح شائعة وتي من ظهور علامتي التجارية أو حملتي.",
      developBrandPersona: "أنت استراتيجي علامات تجارية، وأحتاج مساعدتك في تطوير شخصية العلامة التجارية. اطرح أسئلة توضيحية بسيطة واحدة تلو الأخرى—اطرح سؤالًا، انتظر الرد، ثم انتقل إلى السؤال التالي. اجمع كل المعلومات اللازمة عن قيم العلامة التجارية والجمهور المستهدف قبل تقديم إجاب أو حل مخصص. ثم أنشئ وصفًا مفصلًا لشخصية علامتي التجارية وصوتها وقيمها وكأنها شخص حقيقي. أضف سمات ستجذب جمهوري المستهدف."
    }
  };   

  const handlePromptClick = (promptKey) => {
    setSelectedPrompt(promptKey);
    const detailedPrompt = detailedPrompts[language][promptKey];
    const promptTitle = t(promptKey);
    getResponse(detailedPrompt, true, promptTitle);
  };

  const handleLanguageSelect = (lang) => {
    setLanguage(lang);
    setShowLanguageDropdown(false);
  };

  const translations = {
    en: {
      newWorkspace: "New Chat",
      workspaces: "History",
      name: "PromptAi",
      typeMessage: "Type your message...",
      send: "Send",
      rights: "All rights reserved.",
      craftViralHook: "Craft a viral hook",
      createPersuasiveAdCopy: "Create persuasive ad copy",
      generateTrendingHashtags: "Generate trending hashtags",
      developBrandPersona: "Develop brand persona",
      error: "An error occurred. Please try again.",
      askQuestion: "Please ask a question!"
    },
    ar: {
      newWorkspace: "مساحة عمل جديدة",
      workspaces: "مساحات العمل",
      name: "PromptAi",
      typeMessage: "اكتب رسالتك...",
      send: "إرسال",
      rights: "جميع الحقوق محفوظة.",
      followMe: "تابعني على انستغرام:",
      craftViralHook: "صياغة عنوان جذاب",
      createPersuasiveAdCopy: "إنشاء نص إعلاني مقنع",
      generateTrendingHashtags: "إنشاء هاشتاغات رائجة",
      developBrandPersona: "تطوير شخصية العلامة التجارية",
      error: "حدث خطأ! يرجى المحاولة مرة أخرى.",
      askQuestion: "!يرجى طرح سؤال"
    }
  };

  const t = (key) => translations[language][key] || key;

  const renderPromptBoxes = () => {
    if (!showPromptBoxes && !selectedPrompt) return null;

    return React.createElement('div', { className: "grid grid-cols-2 gap-4 mb-8 max-w-lg mx-auto" },
      promptBoxes.map((box, index) => 
        React.createElement('button', {
          //a
          key: index,
          onClick: () => handlePromptClick(box.text),
          className: `bg-[#2c3539] hover:bg-[#2b2b2b] text-white p-3 rounded-lg flex flex-col items-center justify-center transition duration-300 h-24 ${selectedPrompt === box.text ? 'ring-2 ring-blue-500' : ''}`,
          disabled: isLoading
        }, [
          React.createElement('div', { className: "text-xl mb-2", key: 'icon' }, box.icon),
          React.createElement('p', { className: "text-xs text-center", key: 'text' }, 
            selectedPrompt === box.text ? loadingDots : t(box.text)
          )
        ])
      )
    );
  };

  const renderChatHistory = () => {
    const KyraIcon = ({ isSpinning }) => (
<svg
xmlns="http://www.w3.org/2000/svg"
viewBox="0 0 64 64"
className={`w-12 h-12 ${isSpinning ? 'animate-spin' : ''}`}
>
<defs>
  <linearGradient id="blueVioletGradient" x1="0%" y1="0%" x2="100%" y2="100%">
    <stop offset="0%" style={{ stopColor: '#0000FF', stopOpacity: 1 }} /> {/* Blue */}
    <stop offset="100%" style={{ stopColor: '#8A2BE2', stopOpacity: 1 }} /> {/* Violet */}
  </linearGradient>
</defs>
<g fill="url(#blueVioletGradient)">
  <path
    d="M32 8L36.09 20.09L50 21.64L40.36 30.36L43.64 45.36L32 36.09L20.36 45.36L23.64 30.36L14 21.64L27.91 20.09L32 8z"
  />
  <circle cx="20" cy="8" r="4" />
  <circle cx="44" cy="8" r="4" />
</g>
</svg>

    );

    return React.createElement('div', { className: "space-y-4" },
      chatHistory.map((chatItem, index) => 
        React.createElement('div', {
          key: index,
          className: `flex ${chatItem.role === 'user' ? 'justify-end' : 'justify-start'}`
        },
          React.createElement('div', {
            className: `flex items-start max-w-[70%] ${chatItem.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`
          }, [
            chatItem.role === 'model' && React.createElement('div', {
              className: "mr-3 -mt-2",
              key: 'icon'
            }, React.createElement(KyraIcon, { isSpinning: false })),
            React.createElement('div', {
              className: `p-3 rounded-sm ${
                chatItem.role === 'user' ? 'bg-[#3a3a3a] text-white' : 'bg-[#2b2b2b] text-white'
              } ${language === 'ar' ? 'text-right' : ''}`
            }, renderFormattedMessage(chatItem.parts))
          ])
        )
      ),
      isLoading && React.createElement('div', { className: "flex justify-start" },
        React.createElement('div', { 
          className: "flex items-start"
        }, [
          React.createElement('div', {
            className: "mr-3 -mt-2",
            key: 'icon'
          }, React.createElement(KyraIcon, { isSpinning: true }))
        ])
      ),
      React.createElement('div', { ref: chatEndRef })
    );
  };

  const renderForm = () => {
    return React.createElement('form', {
      onSubmit: (e) => { e.preventDefault(); getResponse(); },
      className: "flex items-center gap-2"
    }, [
      React.createElement('input', {
        value: value,
        onChange: (e) => setValue(e.target.value),
        className: `flex-grow p-3 bg-[#2b2b2b] text-white border border-[#3a3a3a] rounded-sm focus:outline-none focus:ring-2 focus:ring-[#4a4a4a] ${language === 'ar' ? 'text-right' : ''}`,
        placeholder: t('typeMessage'),
        id: "message-input",
        key: 'input',
        dir: language === 'ar' ? 'rtl' : 'ltr'
      }),
      React.createElement('button', {
        type: "submit",
        disabled: isLoading,
        className: "bg-[#3a3a3a] hover:bg-[#4a4a4a] text-white font-semibold p-3 rounded-sm transition duration-300 disabled:opacity-50",
        key: 'button'
      }, React.createElement(FaPaperPlane, { className: "w-6 h-6" }))
    ]);
  };

  const renderSidebar = () => {
    return React.createElement('div', {
      ref: sidebarRef,
      className: `fixed inset-y-0 left-0 z-30 w-64 bg-[#045f5f] p-4 flex flex-col transform ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} transition-transform duration-300 ease-in-out`
    }, [
      React.createElement('button', {
        onClick: toggleSidebar,
        className: "absolute top-4 right-4 text-white hover:text-gray-300"
      }, React.createElement(FaChevronLeft, { className: "h-6 w-6" })),
      React.createElement('h1', { className: "text-lg font-semibold mb-4 text-white" }, t('workspaces')),
      React.createElement('button', {
        onClick: () => createNewWorkspace(),
        className: "bg-[#3a3a3a] hover:bg-[#4a4a3a] text-white font-bold py-2 px-4 rounded-sm mb-2 flex items-center"
      }, [
        React.createElement('span', { className: "mr-2" }, "+"),
        t('newWorkspace')
      ]),
      React.createElement('div', { className: "flex-grow overflow-auto" },
        workspaces.map(workspace => 
          React.createElement('div', { key: workspace.id, className: "flex items-center mb-1" }, [
            React.createElement('button', {
              onClick: () => {
                setCurrentWorkspace(workspace);
                setChatHistory(workspace.history || []);
                setShowPromptBoxes(workspace.history.length === 0);
              },
              className: `flex-grow text-left p-2 rounded-none ${
                currentWorkspace?.id === workspace.id ? 'bg-[#4a4a4a]' : 'bg-[#3a3a3a] hover:bg-[#4a4a4a]'
              }`
            }, workspace.name),
            React.createElement('button', {
              onClick: () => deleteWorkspace(workspace.id),
              className: "bg-[#3a3a3a] hover:bg-[#4a4a4a] text-white p-2 rounded-none",
              title: "Delete workspace"
            }, "X")
          ])
        )
      )
    ]);
  };

  useEffect(() => {
    console.log('Environment variables:');
    console.log('NEXT_PUBLIC_GOOGLE_SEARCH_API_KEY:', process.env.NEXT_PUBLIC_GOOGLE_SEARCH_API_KEY ? 'Defined' : 'Undefined');
    console.log('NEXT_PUBLIC_GOOGLE_SEARCH_ENGINE_ID:', process.env.NEXT_PUBLIC_GOOGLE_SEARCH_ENGINE_ID ? 'Defined' : 'Undefined');
  }, []);

  return React.createElement('div', {
    className: `flex h-screen w-full bg-[#1e1e1e] text-white overflow-hidden ${language === 'ar' ? 'font-arabic' : ''}`
  }, [
    renderSidebar(),
    // Language toggle button
    React.createElement('button', {
      onClick: () => setShowLanguageDropdown(!showLanguageDropdown),
      className: "absolute top-4 right-4 z-30 bg-[#3a3a3a] p-2 rounded-sm",
      key: 'langToggle'
    }, React.createElement(FaLanguage, { className: "w-6 h-6" })),
    showLanguageDropdown && React.createElement('div', {
      className: "absolute top-16 right-4 mt-2 py-2 w-24 bg-[#2b2b2b] rounded-sm shadow-xl z-20"
    }, [
      React.createElement('button', {
        className: "block px-4 py-2 text-sm capitalize text-white hover:bg-[#3a3a3a] w-full text-left",
        onClick: () => handleLanguageSelect('en'),
        key: 'en'
      }, "English"),
      React.createElement('button', {
        className: "block px-4 py-2 text-sm capitalize text-white hover:bg-[#3a3a3a] w-full text-left",
        onClick: () => handleLanguageSelect('ar'),
        key: 'ar'
      }, "العربية")
    ]),

    // Main content
    React.createElement('div', { className: "flex-1 flex flex-col overflow-hidden bg-[#1e1e1e]", key: 'mainContent' }, [
      // Sidebar toggle button
      React.createElement('button', {
        onClick: toggleSidebar,
        className: "absolute top-4 left-4 z-20 bg-[#3a3a3a] p-2 rounded-sm",
        key: 'sidebarToggle'
      }, React.createElement(FaBars, { className: "w-6 h-6" })),

      // Main content area
      React.createElement('main', { className: "flex-grow overflow-auto p-4 pt-16", key: 'main' },
        React.createElement('div', { className: "max-w-3xl mx-auto space-y-4" }, [
          React.createElement('div', { className: "mb-8 flex items-center justify-center", key: 'Kyra' }, [
            React.createElement('p', { className: "text-4xl font-bold text-gray-300 text-center mr-4" }, t('Prompt AI')),
            React.createElement('svg', {
              xmlns: "http://www.w3.org/2000/svg",
              viewBox: "0 0 1080 1080",
              className: "w-12 h-12 text-gray-400"
            },
              // React.createElement('path', {
              //   fill: "currentColor",
              //   d: "M860.4,540.9c0,176.9-143.7,320.5-320.5,320.2c-177.5-0.2-320.3-143.7-320.2-321.6c0.1-176.6,144.3-320.2,321-319.7C717.9,220.3,860.5,363.5,860.4,540.9z M677.7,800.4c-1-0.4-1.7-1.1-2.5-1.1c-46.1-1.1-88.1-16.6-128-38.1c-85.5-46.1-154-111.1-206.9-192.2c-32.6-49.9-57-103.1-59.2-164.2c0-0.6-1-1.2-2.1-2.5c-22.9,43.8-33.9,89.7-34.5,138.4c-0.7,52,20.3,119.8,36.6,137.4c0.7-39.2,11.9-75.2,28.3-110.5c11.4,13.2,19.7,25.3,10,43c-5.2,9.4-6.9,21-9.2,31.8c-5.3,24.8-6.8,49.8,1.5,74.3c2.6,7.8,6.8,15,11.1,24.4c23.7-24.1,45.5-46.3,67.4-68.6c6.4,6.4,12.3,12.2,19.3,19.3c-22.4,22.2-44.6,44.1-67.3,66.6c20.9,13.8,43.8,18.7,67.3,15.3c24.3-3.5,48.1-10.7,72.1-16.3c3.1-0.7,6.9-2.4,9.2-1.2c7.5,4,14.5,9.1,22.9,14.6c-36.3,16.7-72.2,27.9-111.8,28.9C456.3,846.3,620.5,846.3,677.7,800.4z M798.9,680.9c47.4-72.4,46.9-231.4-0.1-279c-0.4,37.2-10.3,71.7-25.3,104.8c-36.9,81.6-93.4,147.6-162.9,203.2c-14.2,11.3-29.2,21.6-45,33.2c12.6,5.4,23.9,10.9,35.7,15.3c30.5,11.4,61.7,19,94.6,15c15.2-1.9,29.7-5.9,43.5-16.5c-23.1-22.7-45.3-44.5-68-66.8c6.1-5.9,11.7-11.2,18.3-17.6c22,22.6,43.8,45.2,66.4,68.4c14.6-21,18.3-42.8,17.6-65.6c-0.8-26.7-7.6-52.1-17.1-76.9c-1.1-2.8-1.8-6.8-0.6-9.1c3.9-7.4,8.8-14.2,14.1-22.4C787.1,603.2,798.2,639.5,798.9,680.9z M323.4,341.4c-32.3,42.9-14,123.4,14.7,171.3c17.4-22.7,34.8-45.6,52.3-68.4c6.9,7.2,12.3,12.7,18.1,18.8c-3.8,4.6-8.3,9.3-12.1,14.6c-13.8,18.9-27.5,37.9-40.8,57.2c-1.7,2.5-2.1,7.7-0.6,10.2c20,33,43.7,63.2,70.9,91.5c9-9,17.9-17.5,26.4-26.5c38.7-41,38-100.6-1.6-140.6c-22.9-23.2-46.1-46.1-69-69.2C362.4,380.9,343.3,361.4,323.4,341.4z M653.9,636.5c25.3-26.1,47-54.3,67-84.1c6.1-9.1,6.2-15.4-0.3-24c-16.4-21.8-32.1-44.1-47.1-64.8c4.7-5.9,9.7-12.1,15.8-19.6c18.3,24,35.5,46.6,53.2,69.8c19.6-40.7,34.5-81.7,30.4-127.2c-1.4-15.9-5.7-30.9-15.1-44c-45.5,45.2-90.7,88.9-134.4,134c-18.9,19.5-25.3,44.8-23.6,72.2C602.3,587.8,627.1,612.2,653.9,636.5z M679.9,280.3c-45.2-23.9-91.3-34.8-140.2-35.5c-53-0.7-122.9,21.7-136.8,36.6c38.9,0.8,74.7,12.2,110.9,28.9c-5.9,3.8-10.6,6.1-14.6,9.4c-7.1,5.9-13.6,5-22.3,2.6c-23.1-6.4-46.6-12.5-70.3-15.3c-23.2-2.8-45.8,2.3-64.6,15.6c28.3,28.5,56.2,56.6,84.3,84.8C498.4,342.7,576.2,288.3,679.9,280.3z M443.4,425.2c59.8,75.6,134.1,74.5,192,0.8c-27.8-27-58.4-50.6-91.4-70.8c-2.2-1.4-7-0.8-9.4,0.7c-11,6.9-22.1,13.8-32.3,21.8C482.3,393.1,462.9,409.3,443.4,425.2z M444.9,655.5c27.9,26.9,57.9,50.1,90.5,70c2.4,1.5,7.5,0.8,10.2-0.8c10.3-6.2,20.6-12.6,30.1-20c20.4-15.9,40.3-32.4,60.4-48.7C578.5,583.3,505,579.9,444.9,655.5z M737.9,323.4c-38.7-30.8-118.8-15.2-169.8,14.9c28.7,22.7,57.6,45.7,86.5,68.6C681.9,379.5,709.7,351.6,737.9,323.4z M581,499.6c-28.1,9.5-54.3,8.5-81.7,0.8c8.5,27.8,8.1,53.9-0.1,81.4c27.7-8.8,54-8.4,81.4-0.5C572.5,553.8,572.4,527.9,581,499.6z"
              // })
            )
          ]),
          showPromptBoxes && !selectedPrompt && renderPromptBoxes(),
          renderChatHistory()
        ])
      ),

      // Footer
      React.createElement('footer', { className: "bg-[#1e1e1e] p-4", key: 'footer' },
        React.createElement('div', { className: "max-w-3xl mx-auto" }, [
          renderForm(),
          error && React.createElement('p', { className: "text-red-500 mt-2", key: 'error' }, t(error)),
          React.createElement('div', { className: "mt-4 text-center text-sm text-gray-400", key: 'footerText' }, [
            React.createElement('p', { key: 'rights' }, `Ashi © 2024 ${t('rights')}`),
            // React.createElement('p', { key: 'followMe' }, [
            //   `${t('followMe')} `,
            //   // React.createElement('a', {
            //   //   href: "aashishaik526@gmail.com",
            //   //   target: "_blank",
            //   //   rel: "noopener noreferrer",
            //   //   className: "text-blue-400 hover:underline"
            //   // }, "aashishaik526@gmail.com")
            // ])
          ])
        ])
      )
    ])
  ]);
}
