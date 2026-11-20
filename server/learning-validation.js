import {invalid,text} from './validation.js';
export function metadataInput(value = {}) {
 if (!value || typeof value!=='object' || Array.isArray(value)) invalid('Invalid metadata');
 const level=value.level||'';
 if(!['','beginner','intermediate','advanced'].includes(level)) invalid('Invalid level');
 const minutes=value.minutes??null;
 if(minutes!==null&&(!Number.isInteger(minutes)||minutes<1||minutes>10000)) invalid('Invalid duration');
 return {level,minutes,language:text(value.language,'language',40,false),prerequisites:text(value.prerequisites,'prerequisites',2000,false),technology_version:text(value.technology_version,'technology version',100,false),outdated:value.outdated===true};
}
export function quizInput(body) {
 if(!Array.isArray(body?.questions)||body.questions.length>30) invalid('Provide up to 30 questions');
 return body.questions.map(q=>{
  if(!Array.isArray(q?.options)||q.options.length<2||q.options.length>6||!Number.isInteger(q.answer)||q.answer<0||q.answer>=q.options.length) invalid('Invalid question options/answer');
  return {text:text(q.text,'question',2000),options:q.options.map(x=>text(x,'option',1000)),answer:q.answer,explanation:text(q.explanation,'explanation',2000,false)};
 });
}
export function gradeQuiz(questions,answers) {
 if(!Array.isArray(answers)||answers.length!==questions.length||!answers.every((a,i)=>Number.isInteger(a)&&a>=0&&a<questions[i].options.length)) invalid('Answer every question');
 return {correct:questions.reduce((n,q,i)=>n+Number(q.answer===answers[i]),0),total:questions.length};
}
