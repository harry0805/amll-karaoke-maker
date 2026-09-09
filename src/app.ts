import { mount } from 'svelte';
import App from './App.svelte';
import './style.css';
import './analytics';

mount(App, { target: document.getElementById('app')! });
