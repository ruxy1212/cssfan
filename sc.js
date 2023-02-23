var c;
let el = document.querySelector('.wrapper'); 
let fr = document.querySelector('.frame');
const ch = document.querySelector('.switches');
ch.onclick = function(){
    if(c==1){ 
        el.classList.replace('switch', 'switche');  
        ch.querySelector('label').classList.replace('active', 'activee');
        fr.classList.replace('framee', 'frameee');
        c = 2;
    }else if(c==2){
        el.classList.remove('switche');  
        ch.querySelector('label').classList.remove('activee');
        fr.classList.remove('frameee');
        c = 0;
    }else{
        el.classList.add('switch');
        ch.querySelector('label').classList.add('active');
        fr.classList.add('framee');
        c = 1;
    }   
}