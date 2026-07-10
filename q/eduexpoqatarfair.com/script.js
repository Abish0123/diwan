// Initialize Lucide Icons
lucide.createIcons();

// Navbar Scroll Effect
const navbar = document.getElementById('navbar');
const logo = document.getElementById('logo');
const navLinks = document.getElementById('nav-links');

window.addEventListener('scroll', () => {
    if (window.scrollY > 50) {
        navbar.classList.remove('bg-transparent', 'py-6');
        navbar.classList.add('bg-white/90', 'backdrop-blur-md', 'shadow-sm', 'py-3');
        navLinks.classList.remove('text-white/90');
        navLinks.classList.add('text-slate-600');
    } else {
        navbar.classList.add('bg-transparent', 'py-6');
        navbar.classList.remove('bg-white/90', 'backdrop-blur-md', 'shadow-sm', 'py-3');
        navLinks.classList.add('text-white/90');
        navLinks.classList.remove('text-slate-600');
    }
});

// Scroll Reveal Animation
const reveals = document.querySelectorAll('.reveal');
const revealOnScroll = () => {
    for (let i = 0; i < reveals.length; i++) {
        const windowHeight = window.innerHeight;
        const elementTop = reveals[i].getBoundingClientRect().top;
        const elementVisible = 150;
        if (elementTop < windowHeight - elementVisible) {
            reveals[i].classList.add('active');
        }
    }
};
window.addEventListener('scroll', revealOnScroll);
revealOnScroll(); // Initial check
